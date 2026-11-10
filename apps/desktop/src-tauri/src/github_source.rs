//! Fuente GitHub en la app: sondeo cada 5 min y al hacer push, y estado de `gh` (Q56, Q65).

use std::path::PathBuf;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use wakeline_core::github::{self, GhStatus, GithubPoller, SystemGh};
use wakeline_core::store::LocalState;
use wakeline_core::watch::normalized_path;

use crate::live::CHANGED_EVENT;

#[derive(Debug, Clone, Serialize)]
pub struct UiGithubStatus {
    /// `owner/repo` si el remoto `origin` está en github.com.
    pub repo: Option<String>,
    pub gh: GhStatus,
    /// Error de la última lectura, si la hubo.
    pub last_error: Option<String>,
}

pub fn start(app: &AppHandle) {
    let emitter = app.clone();
    let poller = GithubPoller::spawn(
        LocalState::default_path(),
        github::cache_path(),
        Duration::from_secs(github::POLL_SECS),
        move |_| {
            let _ = emitter.emit(CHANGED_EVENT, ());
        },
    );
    app.manage(poller);
}

#[tauri::command]
pub async fn get_github_status(path: String) -> Result<UiGithubStatus, String> {
    let state = LocalState::load(&LocalState::default_path());
    let root = state
        .watched_folders
        .iter()
        .find(|saved| normalized_path(saved) == normalized_path(&path))
        .map(PathBuf::from)
        .ok_or("la carpeta no está vigilada")?;
    tauri::async_runtime::spawn_blocking(move || {
        let cache = github::GithubCache::load(&github::cache_path());
        UiGithubStatus {
            repo: github::github_repo(&root),
            gh: github::status(&SystemGh),
            last_error: cache.error(&root).map(Into::into),
        }
    })
    .await
    .map_err(|error| error.to_string())
}

/// Un push o un fetch en un proyecto: se consulta GitHub ya.
pub fn pushed(app: &AppHandle, project: &std::path::Path) {
    if let Some(poller) = app.try_state::<GithubPoller>() {
        poller.pushed(project);
    }
}
