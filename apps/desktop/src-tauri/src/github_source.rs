//! Fuente GitHub: sondeo cada minuto y al hacer push, con avisos de PR abiertas.

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use wakeline_core::alerts::PullRequestTracker;
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
    app.manage(Mutex::new(PullRequestTracker::default()));
    let emitter = app.clone();
    let poller = GithubPoller::spawn(
        LocalState::default_path(),
        github::cache_path(),
        Duration::from_secs(github::POLL_SECS),
        move |project| updated(&emitter, project),
    );
    app.manage(poller);
}

fn updated(app: &AppHandle, project: &std::path::Path) {
    let _ = app.emit(CHANGED_EVENT, ());
    let cache = github::GithubCache::load(&github::cache_path());
    // A failed read preserves the cache but must not announce stale data.
    if cache.error(project).is_some() {
        return;
    }
    let Some(snapshot) = cache.get(project) else {
        return;
    };
    let prefs = app.state::<Mutex<crate::alerts::AlertPrefs>>();
    let prefs = prefs.lock().unwrap_or_else(|e| e.into_inner());
    let (enabled, spanish) = (prefs.enabled, prefs.spanish);
    drop(prefs);
    if !enabled {
        return;
    }
    let tracker = app.state::<Mutex<PullRequestTracker>>();
    let mut tracker = tracker.lock().unwrap_or_else(|e| e.into_inner());
    for pr in &snapshot.pull_requests {
        if tracker.should_notify(&snapshot.repo, pr.number) {
            let title = if spanish {
                format!("PR abierta en {}", snapshot.repo)
            } else {
                format!("Open PR in {}", snapshot.repo)
            };
            if crate::alerts::deliver(app, title, format!("#{} {}", pr.number, pr.title)).is_ok() {
                tracker.delivered(&snapshot.repo, pr.number);
            }
        }
    }
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

#[tauri::command]
pub async fn refresh_github(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = LocalState::load(&LocalState::default_path());
        let mut errors = Vec::new();
        for path in state.watched_folders {
            if let Some(Err(error)) = github::refresh(
                &SystemGh,
                &PathBuf::from(&path),
                &github::cache_path(),
                github::unix_now(),
            ) {
                errors.push(format!("{path}: {error}"));
            }
            updated(&app, &PathBuf::from(&path));
        }
        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors.join("\n"))
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn get_pull_request_details(
    path: String,
    number: u64,
) -> Result<github::PullRequestDetails, String> {
    let state = LocalState::load(&LocalState::default_path());
    let root = state
        .watched_folders
        .iter()
        .find(|saved| normalized_path(saved) == normalized_path(&path))
        .map(PathBuf::from)
        .ok_or("la carpeta no está vigilada")?;
    tauri::async_runtime::spawn_blocking(move || {
        let repo = github::github_repo(&root).ok_or("sin remoto de GitHub")?;
        github::fetch_pr_details(&SystemGh, &repo, number).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Un push o un fetch en un proyecto: se consulta GitHub ya.
pub fn pushed(app: &AppHandle, project: &std::path::Path) {
    if let Some(poller) = app.try_state::<GithubPoller>() {
        poller.pushed(project);
    }
}
