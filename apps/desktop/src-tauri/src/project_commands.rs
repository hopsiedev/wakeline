//! Comandos de `wakeline.toml` en la app: listarlos, aprobarlos y lanzarlos (Q63, Q64).
//!
//! La aprobación lleva el hash que vio el usuario: si el archivo cambió entre que se
//! mostró y se pulsó «Aprobar», no se aprueba nada.

use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use wakeline_core::commands::{
    self, CommandResults, CommandRunner, RunStatus, Trigger, TrustStatus,
};
use wakeline_core::store::LocalState;
use wakeline_core::watch::normalized_path;

use crate::live::CHANGED_EVENT;

#[derive(Debug, Clone, Serialize)]
pub struct UiCommand {
    pub name: String,
    pub run: Vec<String>,
    pub cwd: Option<String>,
    pub on: Trigger,
    pub last_status: Option<RunStatus>,
    pub last_detail: Option<String>,
    pub last_finished_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct UiProjectCommands {
    pub has_config: bool,
    pub error: Option<String>,
    pub hash: Option<String>,
    pub trust: Option<TrustStatus>,
    pub commands: Vec<UiCommand>,
}

/// Arranca el único ejecutor de comandos de la app.
pub fn start(app: &AppHandle) {
    let emitter = app.clone();
    let runner = CommandRunner::spawn(
        LocalState::default_path(),
        commands::results_path(),
        Duration::from_secs(commands::IDLE_DELAY_SECS),
        move |_| {
            let _ = emitter.emit(CHANGED_EVENT, ());
        },
    );
    app.manage(runner);
}

/// Estado de aprobación de un proyecto, para el aviso «Comandos sin aprobar».
pub fn pending_approval(state: &LocalState, root: &Path) -> bool {
    matches!(
        commands::load(root),
        Ok(Some(loaded)) if commands::trust_status(state, root, &loaded.hash) != TrustStatus::Approved
    )
}

#[tauri::command]
pub async fn get_project_commands(path: String) -> Result<UiProjectCommands, String> {
    tauri::async_runtime::spawn_blocking(move || load_project_commands(path))
        .await
        .map_err(|error| error.to_string())?
}

fn load_project_commands(path: String) -> Result<UiProjectCommands, String> {
    let root = watched_root(&path)?;
    let loaded = match commands::load(&root) {
        Ok(Some(loaded)) => loaded,
        Ok(None) => {
            return Ok(UiProjectCommands {
                has_config: false,
                error: None,
                hash: None,
                trust: None,
                commands: Vec::new(),
            });
        }
        Err(error) => {
            return Ok(UiProjectCommands {
                has_config: true,
                error: Some(error),
                hash: None,
                trust: None,
                commands: Vec::new(),
            });
        }
    };
    let state = LocalState::load(&LocalState::default_path());
    let results = CommandResults::load(&commands::results_path());
    let trust = commands::trust_status(&state, &root, &loaded.hash);
    let commands = loaded
        .config
        .commands
        .iter()
        .map(|spec| {
            let last = results.get(&root, &spec.name);
            UiCommand {
                name: spec.name.clone(),
                run: spec.run.clone(),
                cwd: spec.cwd.clone(),
                on: spec.on,
                last_status: last.map(|r| r.status),
                last_detail: last.and_then(|r| r.detail.clone()),
                last_finished_at: last.map(|r| r.finished_at),
            }
        })
        .collect();
    Ok(UiProjectCommands {
        has_config: true,
        error: None,
        hash: Some(loaded.hash),
        trust: Some(trust),
        commands,
    })
}

#[tauri::command(async)]
pub fn approve_project_commands(path: String, hash: String) -> Result<(), String> {
    let _guard = crate::STATE_ACCESS
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let root = watched_root(&path)?;
    let loaded = commands::load(&root)?.ok_or("el proyecto no tiene wakeline.toml")?;
    if loaded.hash != hash {
        return Err("wakeline.toml cambió; revísalo otra vez".into());
    }
    let state_path = LocalState::default_path();
    let mut state = LocalState::load(&state_path);
    commands::approve(&mut state, &root, &hash);
    state.save(&state_path).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn run_project_command(
    app: AppHandle,
    path: String,
    name: String,
) -> Result<RunStatus, String> {
    let root = watched_root(&path)?;
    tauri::async_runtime::spawn_blocking(move || {
        let runner = app.state::<CommandRunner>();
        runner.run_now(&root, &name).map(|result| result.status)
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Solo se aceptan carpetas que el usuario eligió vigilar.
fn watched_root(path: &str) -> Result<PathBuf, String> {
    let state = LocalState::load(&LocalState::default_path());
    state
        .watched_folders
        .iter()
        .find(|saved| normalized_path(saved) == normalized_path(path))
        .map(PathBuf::from)
        .ok_or_else(|| "la carpeta no está vigilada".into())
}
