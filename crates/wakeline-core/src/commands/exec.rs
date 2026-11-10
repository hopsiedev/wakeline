//! Ejecución de un comando aprobado: argv sin shell, con límite de tiempo.
//!
//! En Windows el proceso entra en un Job Object; al agotar el tiempo se termina el job,
//! que corta también los hijos (`npx` → `node` → `tsc`) sin lanzar ningún otro programa.

use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use super::{CommandSpec, TrustedConfig};

/// Lo que se guarda de cada salida; lo demás se descarta.
const MAX_OUTPUT_BYTES: usize = 8 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunOutput {
    pub success: bool,
    pub exit_code: Option<i32>,
    pub timed_out: bool,
    pub stdout: String,
    pub stderr: String,
    pub duration: Duration,
}

/// Ejecuta `name` de una configuración aprobada. Si no está en el archivo, no corre nada.
pub fn execute(project_root: &Path, trusted: &TrustedConfig, name: &str) -> io::Result<RunOutput> {
    let spec = trusted.command(name).ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::NotFound,
            format!("`{name}` no está en wakeline.toml"),
        )
    })?;
    run_spec(project_root, spec)
}

fn run_spec(project_root: &Path, spec: &CommandSpec) -> io::Result<RunOutput> {
    let cwd = match &spec.cwd {
        Some(dir) => project_root.join(dir),
        None => project_root.to_path_buf(),
    };
    let program = resolve_program(&spec.run[0], &cwd).ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::NotFound,
            format!("no se encontró `{}` en el PATH", spec.run[0]),
        )
    })?;

    let mut command = Command::new(program);
    command
        .args(&spec.run[1..])
        .current_dir(&cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }

    let started = Instant::now();
    let mut child = command.spawn()?;
    let job = job::Job::assign(&child);
    let stdout = read_in_background(child.stdout.take());
    let stderr = read_in_background(child.stderr.take());

    let timeout = Duration::from_secs(spec.timeout_secs);
    let mut timed_out = false;
    let status = loop {
        if let Some(status) = child.try_wait()? {
            break status;
        }
        if started.elapsed() >= timeout {
            timed_out = true;
            match &job {
                Some(job) => job.terminate(),
                None => {
                    let _ = child.kill();
                }
            }
            break child.wait()?;
        }
        std::thread::sleep(Duration::from_millis(50));
    };

    Ok(RunOutput {
        success: status.success() && !timed_out,
        exit_code: status.code(),
        timed_out,
        stdout: stdout.join().unwrap_or_default(),
        stderr: stderr.join().unwrap_or_default(),
        duration: started.elapsed(),
    })
}

fn read_in_background<R: Read + Send + 'static>(
    pipe: Option<R>,
) -> std::thread::JoinHandle<String> {
    std::thread::spawn(move || {
        let Some(mut pipe) = pipe else {
            return String::new();
        };
        let mut kept = Vec::new();
        let mut buffer = [0u8; 64 * 1024];
        // Se sigue leyendo aunque se pase del límite para que el proceso no se bloquee.
        while let Ok(read) = pipe.read(&mut buffer) {
            if read == 0 {
                break;
            }
            let room = MAX_OUTPUT_BYTES.saturating_sub(kept.len());
            kept.extend_from_slice(&buffer[..read.min(room)]);
        }
        String::from_utf8_lossy(&kept).into_owned()
    })
}

/// Busca el programa como lo haría la consola, pero sin pasar por ella: `npx` encuentra
/// `npx.cmd` gracias a `PATHEXT`. Una ruta con barras se toma relativa a `cwd`.
pub(crate) fn resolve_program(name: &str, cwd: &Path) -> Option<PathBuf> {
    let path = Path::new(name);
    if path.components().count() > 1 || path.is_absolute() {
        let candidate = if path.is_absolute() {
            path.to_path_buf()
        } else {
            cwd.join(path)
        };
        return candidates(&candidate).into_iter().find(|p| p.is_file());
    }
    let dirs = std::env::var_os("PATH")?;
    std::env::split_paths(&dirs)
        .flat_map(|dir| candidates(&dir.join(name)))
        .find(|p| p.is_file())
}

fn candidates(base: &Path) -> Vec<PathBuf> {
    if base.extension().is_some() || !cfg!(windows) {
        return vec![base.to_path_buf()];
    }
    let pathext = std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".into());
    pathext
        .split(';')
        .filter(|ext| !ext.is_empty())
        .map(|ext| {
            let mut name = base.as_os_str().to_owned();
            name.push(ext.to_lowercase());
            PathBuf::from(name)
        })
        .collect()
}

#[cfg(windows)]
mod job {
    use std::os::windows::io::AsRawHandle;
    use std::process::Child;

    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, TerminateJobObject,
    };

    pub struct Job(HANDLE);

    impl Job {
        pub fn assign(child: &Child) -> Option<Self> {
            // SAFETY: llamadas FFI con argumentos válidos; el handle se cierra en Drop.
            unsafe {
                let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
                if handle.is_null() {
                    return None;
                }
                let job = Self(handle);
                (AssignProcessToJobObject(handle, child.as_raw_handle() as HANDLE) != 0)
                    .then_some(job)
            }
        }

        pub fn terminate(&self) {
            // SAFETY: el handle es válido mientras exista `self`.
            unsafe {
                TerminateJobObject(self.0, 1);
            }
        }
    }

    impl Drop for Job {
        fn drop(&mut self) {
            // SAFETY: el handle es nuestro y se cierra una sola vez.
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
}

#[cfg(unix)]
mod job {
    use std::process::Child;

    pub struct Job(libc::pid_t);

    impl Job {
        pub fn assign(child: &Child) -> Option<Self> {
            Some(Self(child.id().try_into().ok()?))
        }

        pub fn terminate(&self) {
            // SAFETY: the child starts its own process group before exec; the
            // negative PID targets that group, including descendants with pipes.
            unsafe {
                libc::kill(-self.0, libc::SIGKILL);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::{approve, load_trusted};
    use crate::store::LocalState;

    #[cfg(unix)]
    #[test]
    fn unix_timeout_stops_descendants_holding_output_pipes() {
        let (dir, state) = project_with(
            "unix-tree",
            "[[command]]\nname = \"slow\"\nrun = [\"/bin/sh\", \"-c\", \"sleep 30 & wait\"]\ntimeout_secs = 1\n",
        );
        let trusted = load_trusted(&dir, &state).unwrap();
        let started = Instant::now();
        let result = execute(&dir, &trusted, "slow").unwrap();
        assert!(result.timed_out);
        assert!(started.elapsed() < Duration::from_secs(5));
        let _ = std::fs::remove_dir_all(dir);
    }

    fn project_with(name: &str, toml: &str) -> (PathBuf, LocalState) {
        let dir = std::env::temp_dir().join(format!("wakeline-exec-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(super::super::CONFIG_FILE), toml).unwrap();
        let mut state = LocalState::default();
        let loaded = super::super::load(&dir).unwrap().unwrap();
        approve(&mut state, &dir, &loaded.hash);
        (dir, state)
    }

    #[cfg(windows)]
    #[test]
    fn runs_a_listed_command_and_reports_failure() {
        let (dir, state) = project_with(
            "fail",
            "[[command]]\nname = \"falla\"\nrun = [\"cmd\", \"/C\", \"echo malo 1>&2 & exit 3\"]\n",
        );
        let trusted = load_trusted(&dir, &state).unwrap();
        let output = execute(&dir, &trusted, "falla").unwrap();
        assert!(!output.success);
        assert_eq!(output.exit_code, Some(3));
        assert!(output.stderr.contains("malo"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(windows)]
    #[test]
    fn timeout_kills_the_process_tree() {
        let (dir, state) = project_with(
            "timeout",
            "[[command]]\nname = \"lento\"\nrun = [\"powershell\", \"-NoProfile\", \"-Command\", \"Start-Sleep 30\"]\ntimeout_secs = 1\n",
        );
        let trusted = load_trusted(&dir, &state).unwrap();
        let output = execute(&dir, &trusted, "lento").unwrap();
        assert!(output.timed_out);
        assert!(!output.success);
        assert!(output.duration < Duration::from_secs(10));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn unlisted_commands_never_run() {
        let (dir, state) = project_with("unlisted", "[[command]]\nname = \"a\"\nrun = [\"x\"]\n");
        let trusted = load_trusted(&dir, &state).unwrap();
        let error = execute(&dir, &trusted, "rm").unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::NotFound);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn missing_program_is_an_error_not_a_shell_fallback() {
        let (dir, state) = project_with(
            "missing",
            "[[command]]\nname = \"a\"\nrun = [\"programa-que-no-existe-wakeline\"]\n",
        );
        let trusted = load_trusted(&dir, &state).unwrap();
        assert!(execute(&dir, &trusted, "a").is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
