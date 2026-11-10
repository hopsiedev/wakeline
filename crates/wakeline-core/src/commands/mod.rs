//! Comandos configurados en `wakeline.toml` (Q44 a Q46, Q55).
//!
//! Wakeline nunca ejecuta nada que no esté en ese archivo, y solo después de que el
//! usuario lo apruebe: se guarda el SHA-256 del archivo en `state.json` y si cambia hay
//! que aprobarlo otra vez. El único camino para ejecutar es [`TrustedConfig`], que solo
//! se obtiene con una aprobación vigente.

pub(crate) mod exec;
pub mod parsers;
mod results;
mod runner;

use std::collections::HashSet;
use std::path::{Component, Path};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::store::LocalState;
use crate::watch::normalized_path;

pub use exec::{RunOutput, execute};
pub use parsers::ParserKind;
pub use results::{CommandCard, CommandResult, CommandResults, RunStatus, evaluate, results_path};
pub use runner::{ChangeRouter, CommandRunner, IdleScheduler};

pub const CONFIG_FILE: &str = "wakeline.toml";
/// Tiempo sin cambios antes de lanzar los comandos `idle`.
pub const IDLE_DELAY_SECS: u64 = 30;
const MAX_TIMEOUT_SECS: u64 = 3600;

/// Cuándo se lanza un comando.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Trigger {
    /// Tras unos 30 s sin cambios en el proyecto.
    #[default]
    Idle,
    /// Solo cuando el usuario lo pide.
    Manual,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CommandSpec {
    pub name: String,
    /// Programa y argumentos. Nunca pasa por una shell.
    pub run: Vec<String>,
    /// Carpeta relativa al proyecto donde se ejecuta.
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub on: Trigger,
    #[serde(default)]
    pub parser: ParserKind,
    #[serde(default = "default_timeout")]
    pub timeout_secs: u64,
}

fn default_timeout() -> u64 {
    300
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProjectConfig {
    #[serde(default, rename = "command")]
    pub commands: Vec<CommandSpec>,
}

/// `wakeline.toml` leído y validado, todavía sin permiso para ejecutar.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LoadedConfig {
    pub config: ProjectConfig,
    /// SHA-256 del archivo tal como está en disco.
    pub hash: String,
}

/// Configuración aprobada por el usuario: lo único que permite ejecutar.
#[derive(Debug, Clone)]
pub struct TrustedConfig {
    config: ProjectConfig,
}

impl TrustedConfig {
    pub fn commands(&self) -> &[CommandSpec] {
        &self.config.commands
    }

    pub fn command(&self, name: &str) -> Option<&CommandSpec> {
        self.config.commands.iter().find(|c| c.name == name)
    }
}

impl LoadedConfig {
    /// Devuelve la configuración ejecutable solo si el hash aprobado coincide.
    pub fn trusted(self, state: &LocalState, project_root: &Path) -> Option<TrustedConfig> {
        state
            .trusted_commands
            .get(&trust_key(project_root))
            .is_some_and(|approved| *approved == self.hash)
            .then_some(TrustedConfig {
                config: self.config,
            })
    }
}

/// Lee `wakeline.toml` del proyecto. `Ok(None)` si no existe.
pub fn load(project_root: &Path) -> Result<Option<LoadedConfig>, String> {
    let path = project_root.join(CONFIG_FILE);
    let bytes = match std::fs::read(&path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("no se pudo leer {CONFIG_FILE}: {error}")),
    };
    let text =
        std::str::from_utf8(&bytes).map_err(|_| format!("{CONFIG_FILE} no es texto UTF-8"))?;
    let config = parse(text)?;
    Ok(Some(LoadedConfig {
        config,
        hash: hash_bytes(&bytes),
    }))
}

/// Lee `wakeline.toml` del proyecto solo si está aprobado tal como está ahora.
pub fn load_trusted(project_root: &Path, state: &LocalState) -> Option<TrustedConfig> {
    load(project_root).ok()??.trusted(state, project_root)
}

/// Interpreta y valida el contenido de `wakeline.toml`.
pub fn parse(text: &str) -> Result<ProjectConfig, String> {
    let config: ProjectConfig =
        toml::from_str(text).map_err(|error| format!("{CONFIG_FILE} no es válido: {error}"))?;
    let mut names = HashSet::new();
    for command in &config.commands {
        let name = command.name.trim();
        if name.is_empty() {
            return Err("cada comando necesita un `name`".into());
        }
        if !names.insert(name.to_string()) {
            return Err(format!("el comando `{name}` está repetido"));
        }
        if command
            .run
            .first()
            .is_none_or(|program| program.trim().is_empty())
        {
            return Err(format!("`run` de `{name}` está vacío"));
        }
        if let Some(cwd) = &command.cwd
            && !is_safe_relative(cwd)
        {
            return Err(format!(
                "`cwd` de `{name}` debe ser una carpeta dentro del proyecto"
            ));
        }
        if command.timeout_secs == 0 || command.timeout_secs > MAX_TIMEOUT_SECS {
            return Err(format!(
                "`timeout_secs` de `{name}` debe estar entre 1 y {MAX_TIMEOUT_SECS}"
            ));
        }
    }
    Ok(config)
}

/// Guarda la aprobación del archivo con este hash para el proyecto.
pub fn approve(state: &mut LocalState, project_root: &Path, hash: &str) {
    state
        .trusted_commands
        .insert(trust_key(project_root), hash.to_string());
}

/// Estado de aprobación de un proyecto, para la interfaz.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TrustStatus {
    Approved,
    /// Nunca se aprobó.
    Pending,
    /// Se aprobó otra versión del archivo.
    Changed,
}

pub fn trust_status(state: &LocalState, project_root: &Path, hash: &str) -> TrustStatus {
    match state.trusted_commands.get(&trust_key(project_root)) {
        Some(approved) if approved == hash => TrustStatus::Approved,
        Some(_) => TrustStatus::Changed,
        None => TrustStatus::Pending,
    }
}

fn trust_key(project_root: &Path) -> String {
    normalized_path(&project_root.to_string_lossy())
}

fn hash_bytes(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn is_safe_relative(path: &str) -> bool {
    let path = Path::new(path);
    path.components()
        .all(|c| matches!(c, Component::Normal(_) | Component::CurDir))
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"
[[command]]
name = "tsc"
run = ["npx", "tsc", "--noEmit"]
cwd = "apps/desktop"
parser = "tsc"

[[command]]
name = "test"
run = ["cargo", "test"]
on = "manual"
timeout_secs = 900
"#;

    fn temp_project(name: &str) -> std::path::PathBuf {
        let dir =
            std::env::temp_dir().join(format!("wakeline-commands-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn parses_the_documented_format_with_defaults() {
        let config = parse(SAMPLE).unwrap();
        assert_eq!(config.commands.len(), 2);
        let tsc = &config.commands[0];
        assert_eq!(tsc.run, vec!["npx", "tsc", "--noEmit"]);
        assert_eq!(tsc.cwd.as_deref(), Some("apps/desktop"));
        assert_eq!(tsc.on, Trigger::Idle);
        assert_eq!(tsc.parser, ParserKind::Tsc);
        assert_eq!(tsc.timeout_secs, 300);
        let test = &config.commands[1];
        assert_eq!(test.on, Trigger::Manual);
        assert_eq!(test.parser, ParserKind::Raw);
        assert_eq!(test.timeout_secs, 900);
    }

    #[test]
    fn rejects_shell_strings_unknown_keys_and_unsafe_folders() {
        assert!(parse("[[command]]\nname = \"a\"\nrun = \"npm test && rm -rf /\"\n").is_err());
        assert!(parse("[[command]]\nname = \"a\"\nrun = [\"x\"]\nshell = true\n").is_err());
        assert!(parse("[[command]]\nname = \"a\"\nrun = []\n").is_err());
        assert!(parse("[[command]]\nname = \"a\"\nrun = [\"x\"]\ncwd = \"../otro\"\n").is_err());
        assert!(parse("[[command]]\nname = \"a\"\nrun = [\"x\"]\ncwd = \"/Windows\"\n").is_err());
        assert!(parse("[[command]]\nname = \"a\"\nrun = [\"x\"]\n[[command]]\nname = \"a\"\nrun = [\"y\"]\n").is_err());
        assert!(parse("[[command]]\nname = \"a\"\nrun = [\"x\"]\ntimeout_secs = 0\n").is_err());
    }

    #[test]
    fn nothing_runs_until_approved_and_a_change_needs_a_new_approval() {
        let dir = temp_project("trust");
        std::fs::write(dir.join(CONFIG_FILE), SAMPLE).unwrap();
        let mut state = LocalState::default();

        let loaded = load(&dir).unwrap().unwrap();
        assert_eq!(
            trust_status(&state, &dir, &loaded.hash),
            TrustStatus::Pending
        );
        assert!(load_trusted(&dir, &state).is_none());

        approve(&mut state, &dir, &loaded.hash);
        let trusted = load_trusted(&dir, &state).expect("aprobado");
        assert!(trusted.command("tsc").is_some());
        assert!(trusted.command("rm").is_none());

        std::fs::write(dir.join(CONFIG_FILE), format!("{SAMPLE}\n# otro\n")).unwrap();
        let changed = load(&dir).unwrap().unwrap();
        assert_eq!(
            trust_status(&state, &dir, &changed.hash),
            TrustStatus::Changed
        );
        assert!(load_trusted(&dir, &state).is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn project_without_config_has_no_commands() {
        let dir = temp_project("none");
        assert_eq!(load(&dir), Ok(None));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
