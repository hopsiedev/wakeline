//! Fuente GitHub: sondeo cada minuto y al hacer push, con avisos de PR abiertas.

use std::path::PathBuf;
use std::sync::Mutex;
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
        move |project| updated(&emitter, project),
    );
    app.manage(poller);
    start_account_notifications(app);
}

fn updated(app: &AppHandle, _project: &std::path::Path) {
    let _ = app.emit(CHANGED_EVENT, ());
}

// Account-wide PR notifications share the dashboard cache and survive restarts.
// Learn the initial set silently; retain delivered IDs without writing PR content.
fn start_account_notifications(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        use std::collections::HashSet;
        let path = LocalState::default_path().with_file_name("github-notified.json");
        let initial = std::fs::read(&path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<HashSet<String>>(&bytes).ok());
        let mut initialized = initial.is_some();
        let mut seen = initial.unwrap_or_default();
        std::thread::sleep(Duration::from_secs(30));
        loop {
            let since = format!(
                "{}T00:00:00.000Z",
                (time::OffsetDateTime::now_utc() - time::Duration::days(60)).date()
            );
            if let Ok(data) = wakeline_core::github_workspace::cached(&since)
                && data["warnings"]
                    .as_array()
                    .is_some_and(|warnings| warnings.is_empty())
                && let Some(prs) = data["pull_requests"].as_array()
            {
                let prefs = app.state::<Mutex<crate::alerts::AlertPrefs>>();
                let prefs = prefs.lock().unwrap_or_else(|error| error.into_inner());
                let (enabled, spanish) = (prefs.enabled && prefs.pull_requests, prefs.spanish);
                drop(prefs);
                let current: Vec<_> = prs
                    .iter()
                    .filter(|pr| pr["state"] == "open" || pr["state"] == "review")
                    .collect();
                let new: Vec<_> = current
                    .iter()
                    .filter(|pr| pr["id"].as_str().is_some_and(|id| !seen.contains(id)))
                    .collect();
                let delivered = if initialized && enabled && !new.is_empty() {
                    let title = if spanish {
                        format!("{} PR nuevas", new.len())
                    } else {
                        format!("{} new pull requests", new.len())
                    };
                    let pr = new[0];
                    crate::alerts::deliver(
                        &app,
                        title,
                        format!(
                            "{} #{}: {}",
                            pr["repository"].as_str().unwrap_or_default(),
                            pr["number"],
                            pr["title"].as_str().unwrap_or_default()
                        ),
                    )
                    .is_ok()
                } else {
                    true
                };
                if delivered {
                    seen.extend(
                        current
                            .iter()
                            .filter_map(|pr| pr["id"].as_str().map(str::to_string)),
                    );
                    initialized = true;
                    if let Some(parent) = path.parent()
                        && let Ok(file) = tempfile_for_notifications(parent, &seen)
                    {
                        let _ = file.persist(&path);
                    }
                }
            }
            std::thread::sleep(Duration::from_secs(5 * 60));
        }
    });
}

fn tempfile_for_notifications(
    parent: &std::path::Path,
    seen: &std::collections::HashSet<String>,
) -> std::io::Result<tempfile::NamedTempFile> {
    use std::io::Write;
    let mut file = tempfile::NamedTempFile::new_in(parent)?;
    serde_json::to_writer(&mut file, seen)?;
    file.flush()?;
    Ok(file)
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
