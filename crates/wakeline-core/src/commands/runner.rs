//! Cuándo se lanzan los comandos `idle` y quién los ejecuta (Q55).
//!
//! - Tras [`IDLE_DELAY_SECS`](super::IDLE_DELAY_SECS) sin cambios en el proyecto.
//! - Un comando a la vez: un solo hilo ejecuta todo, también lo que se pide a mano.
//! - Si hay cambios mientras corre, al terminar queda pendiente y se relanza una vez.
//! - Los cambios en rutas de `.gitignore` (salidas de build, cachés) no cuentan; si no,
//!   un comando que escribe su caché se relanzaría para siempre.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use ignore::gitignore::Gitignore;

use super::results::{CommandResult, CommandResults, evaluate};
use super::{Trigger, execute, load, load_trusted};
use crate::store::LocalState;
use crate::watcher::{is_ignored_path, is_push_signal};

/// Decide qué proyectos llevan el tiempo de espera sin cambios.
#[derive(Debug)]
pub struct IdleScheduler {
    delay: Duration,
    pending: HashMap<PathBuf, Instant>,
    running: HashSet<PathBuf>,
}

impl IdleScheduler {
    pub fn new(delay: Duration) -> Self {
        Self {
            delay,
            pending: HashMap::new(),
            running: HashSet::new(),
        }
    }

    /// Hubo un cambio en el proyecto: se reinicia su espera.
    pub fn touch(&mut self, project: &Path, now: Instant) {
        self.pending.insert(project.to_path_buf(), now);
    }

    /// Proyectos listos para ejecutar; quedan marcados como en curso.
    pub fn due(&mut self, now: Instant) -> Vec<PathBuf> {
        let ready: Vec<PathBuf> = self
            .pending
            .iter()
            .filter(|(project, last)| {
                !self.running.contains(*project) && now.duration_since(**last) >= self.delay
            })
            .map(|(project, _)| project.clone())
            .collect();
        for project in &ready {
            self.pending.remove(project);
            self.running.insert(project.clone());
        }
        ready
    }

    pub fn finished(&mut self, project: &Path) {
        self.running.remove(project);
    }
}

/// Asigna cada ruta cambiada a su proyecto, descartando lo que ignora `.gitignore`.
pub struct ChangeRouter {
    projects: Vec<(PathBuf, Gitignore)>,
}

impl ChangeRouter {
    pub fn new(projects: &[PathBuf]) -> Self {
        Self {
            projects: projects
                .iter()
                .map(|root| (root.clone(), Gitignore::new(root.join(".gitignore")).0))
                .collect(),
        }
    }

    /// Proyecto al que pertenece un cambio de `.git/refs/remotes` (push o fetch).
    pub fn pushed_project(&self, path: &Path) -> Option<&Path> {
        if !is_push_signal(path) {
            return None;
        }
        let path = strip_verbatim(path);
        self.projects
            .iter()
            .find(|(root, _)| path.starts_with(strip_verbatim(root)))
            .map(|(root, _)| root.as_path())
    }

    pub fn route(&self, path: &Path) -> Option<&Path> {
        // Un push no cambia el código: no lanza los comandos.
        if is_ignored_path(path) || is_push_signal(path) {
            return None;
        }
        let path = strip_verbatim(path);
        self.projects.iter().find_map(|(root, gitignore)| {
            let relative = path.strip_prefix(strip_verbatim(root)).ok()?;
            let ignored = gitignore
                .matched_path_or_any_parents(relative, false)
                .is_ignore();
            (!ignored).then_some(root.as_path())
        })
    }
}

fn strip_verbatim(path: &Path) -> PathBuf {
    let text = path.to_string_lossy();
    PathBuf::from(text.strip_prefix(r"\\?\").unwrap_or(&text))
}

enum Message {
    Changed(PathBuf),
    RunNow {
        project: PathBuf,
        name: String,
        reply: Sender<Result<CommandResult, String>>,
    },
    Stop,
}

/// Hilo que ejecuta los comandos aprobados. Se para al soltarlo.
pub struct CommandRunner {
    tx: Sender<Message>,
}

impl CommandRunner {
    /// `on_result` se llama tras cada ejecución, ya guardada en `results_path`.
    pub fn spawn(
        state_path: PathBuf,
        results_path: PathBuf,
        delay: Duration,
        on_result: impl Fn(&CommandResult) + Send + 'static,
    ) -> Self {
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            let mut scheduler = IdleScheduler::new(delay);
            let tick = delay.min(Duration::from_secs(1));
            loop {
                match rx.recv_timeout(tick) {
                    Ok(Message::Changed(project)) => scheduler.touch(&project, Instant::now()),
                    Ok(Message::RunNow {
                        project,
                        name,
                        reply,
                    }) => {
                        let result = run_one(&state_path, &results_path, &project, &name);
                        if let Ok(result) = &result {
                            on_result(result);
                        }
                        let _ = reply.send(result);
                    }
                    Ok(Message::Stop) | Err(RecvTimeoutError::Disconnected) => break,
                    Err(RecvTimeoutError::Timeout) => {}
                }
                for project in scheduler.due(Instant::now()) {
                    for result in run_idle(&state_path, &results_path, &project) {
                        on_result(&result);
                    }
                    scheduler.finished(&project);
                }
            }
        });
        Self { tx }
    }

    /// Avisa de un cambio en un proyecto vigilado.
    pub fn changed(&self, project: &Path) {
        let _ = self.tx.send(Message::Changed(project.to_path_buf()));
    }

    /// Ejecuta ya un comando aprobado (`manual` o `idle`) y espera su resultado.
    pub fn run_now(&self, project: &Path, name: &str) -> Result<CommandResult, String> {
        let (reply, answer) = mpsc::channel();
        self.tx
            .send(Message::RunNow {
                project: project.to_path_buf(),
                name: name.to_string(),
                reply,
            })
            .map_err(|_| "el ejecutor de comandos está parado".to_string())?;
        answer
            .recv()
            .map_err(|_| "el ejecutor de comandos está parado".to_string())?
    }
}

impl Drop for CommandRunner {
    fn drop(&mut self) {
        let _ = self.tx.send(Message::Stop);
    }
}

fn run_idle(state_path: &Path, results_path: &Path, project: &Path) -> Vec<CommandResult> {
    let state = LocalState::load(state_path);
    let Some(trusted) = load_trusted(project, &state) else {
        return Vec::new();
    };
    let names: Vec<String> = trusted
        .commands()
        .iter()
        .filter(|c| c.on == Trigger::Idle)
        .map(|c| c.name.clone())
        .collect();
    names
        .iter()
        .filter_map(|name| run_one(state_path, results_path, project, name).ok())
        .collect()
}

fn run_one(
    state_path: &Path,
    results_path: &Path,
    project: &Path,
    name: &str,
) -> Result<CommandResult, String> {
    let state = LocalState::load(state_path);
    let trusted = match load(project)? {
        Some(loaded) => loaded
            .trusted(&state, project)
            .ok_or("los comandos de este proyecto no están aprobados")?,
        None => return Err("el proyecto no tiene wakeline.toml".into()),
    };
    let spec = trusted
        .command(name)
        .ok_or_else(|| format!("`{name}` no está en wakeline.toml"))?
        .clone();
    let outcome = execute(project, &trusted, name);
    let result = evaluate(project, &spec, outcome, unix_now());
    let mut results = CommandResults::load(results_path);
    results.record(result.clone());
    results
        .save(results_path)
        .map_err(|error| format!("no se pudo guardar el resultado: {error}"))?;
    Ok(result)
}

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(windows)]
    use crate::commands::{CONFIG_FILE, RunStatus, approve};

    #[test]
    fn waits_for_quiet_and_runs_once_per_burst() {
        let mut scheduler = IdleScheduler::new(Duration::from_secs(30));
        let project = Path::new("C:/p");
        let t0 = Instant::now();
        scheduler.touch(project, t0);
        scheduler.touch(project, t0 + Duration::from_secs(20));
        assert!(scheduler.due(t0 + Duration::from_secs(40)).is_empty());
        assert_eq!(scheduler.due(t0 + Duration::from_secs(50)), vec![project]);
        assert!(scheduler.due(t0 + Duration::from_secs(90)).is_empty());
    }

    #[test]
    fn changes_while_running_rerun_after_it_finishes() {
        let mut scheduler = IdleScheduler::new(Duration::from_secs(30));
        let project = Path::new("C:/p");
        let t0 = Instant::now();
        scheduler.touch(project, t0);
        assert_eq!(scheduler.due(t0 + Duration::from_secs(30)).len(), 1);
        scheduler.touch(project, t0 + Duration::from_secs(35));
        // Sigue en curso: no se lanza otra copia.
        assert!(scheduler.due(t0 + Duration::from_secs(70)).is_empty());
        scheduler.finished(project);
        assert_eq!(scheduler.due(t0 + Duration::from_secs(70)).len(), 1);
    }

    #[test]
    fn router_skips_gitignored_and_build_paths() {
        let dir = std::env::temp_dir().join(format!("wakeline-router-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(".gitignore"), "*.tsbuildinfo\ncache/\n").unwrap();
        let router = ChangeRouter::new(std::slice::from_ref(&dir));

        assert_eq!(
            router.route(&dir.join("src").join("a.ts")),
            Some(dir.as_path())
        );
        assert_eq!(router.route(&dir.join("app.tsbuildinfo")), None);
        assert_eq!(router.route(&dir.join("cache").join("x")), None);
        assert_eq!(router.route(&dir.join("node_modules").join("x.js")), None);
        let pushed = dir
            .join(".git")
            .join("refs")
            .join("remotes")
            .join("origin")
            .join("main");
        assert_eq!(router.route(&pushed), None);
        assert_eq!(router.pushed_project(&pushed), Some(dir.as_path()));
        assert_eq!(router.route(Path::new(r"C:\otro\a.ts")), None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(windows)]
    #[test]
    fn runner_runs_only_approved_commands_and_saves_the_result() {
        let base = std::env::temp_dir().join(format!("wakeline-runner-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let project = base.join("p");
        std::fs::create_dir_all(&project).unwrap();
        std::fs::write(
            project.join(CONFIG_FILE),
            "[[command]]\nname = \"falla\"\nrun = [\"cmd\", \"/C\", \"exit 1\"]\non = \"manual\"\n",
        )
        .unwrap();
        let state_path = base.join("state.json");
        let results_path = base.join("commands.json");
        let mut state = LocalState {
            config_version: 1,
            ..LocalState::default()
        };
        state.save(&state_path).unwrap();

        let runner = CommandRunner::spawn(
            state_path.clone(),
            results_path.clone(),
            Duration::from_millis(50),
            |_| {},
        );
        assert!(
            runner.run_now(&project, "falla").is_err(),
            "sin aprobar no corre"
        );

        let hash = load(&project).unwrap().unwrap().hash;
        approve(&mut state, &project, &hash);
        state.save(&state_path).unwrap();
        let result = runner.run_now(&project, "falla").unwrap();
        assert_eq!(result.status, RunStatus::Failed);
        assert_eq!(result.cards.len(), 1);
        assert!(runner.run_now(&project, "otro").is_err());
        assert_eq!(
            CommandResults::load(&results_path)
                .get(&project, "falla")
                .map(|r| r.status),
            Some(RunStatus::Failed)
        );
        drop(runner);
        let _ = std::fs::remove_dir_all(&base);
    }
}
