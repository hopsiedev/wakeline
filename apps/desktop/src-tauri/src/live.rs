//! Vigilancia en tiempo real dentro de la app (Q39).
//!
//! Vigila las carpetas de `state.json` y las sesiones de Claude Code con el vigilante
//! de `wakeline-core`. Cada lote de cambios emite [`CHANGED_EVENT`] y la interfaz vuelve
//! a pedir las tarjetas, y los cambios de cada proyecto llegan al ejecutor de comandos
//! (Q55). Se reinicia al añadir o quitar una carpeta.

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};
use wakeline_core::commands::{ChangeRouter, CommandRunner};
use wakeline_core::store::LocalState;
use wakeline_core::watcher::{DirWatcher, Stopper};

pub const CHANGED_EVENT: &str = "wakeline://changed";

const DEBOUNCE: Duration = Duration::from_millis(1500);
const MAX_WAIT: Duration = Duration::from_secs(10);

#[derive(Default)]
struct Live(Mutex<Option<Stopper>>, Mutex<WatchStatus>);
#[derive(Default, Clone, serde::Serialize)]
pub struct WatchStatus {
    pub watching: Vec<String>,
    pub errors: Vec<String>,
    pub last_scan: Option<u64>,
}
static LAST_SCAN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
pub fn scanned() {
    LAST_SCAN.store(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
        std::sync::atomic::Ordering::Relaxed,
    );
}
pub fn status(app: &AppHandle) -> WatchStatus {
    let Some(live) = app.try_state::<Live>() else {
        return WatchStatus::default();
    };
    let mut health = live.1.lock().unwrap_or_else(|e| e.into_inner());
    let mut missing = Vec::new();
    health.watching.retain(|path| {
        if std::path::Path::new(path).is_dir() {
            true
        } else {
            missing.push(path.clone());
            false
        }
    });
    health.errors.extend(missing);
    let last = LAST_SCAN.load(std::sync::atomic::Ordering::Relaxed);
    health.last_scan = (last > 0).then_some(last);
    health.clone()
}

pub fn start(app: &AppHandle) {
    app.manage(Live::default());
    restart(app);
}

/// Para el vigilante anterior y arranca otro con las carpetas actuales.
pub fn restart(app: &AppHandle) {
    let Some(live) = app.try_state::<Live>() else {
        return;
    };
    let mut slot = live.0.lock().unwrap_or_else(|poison| poison.into_inner());
    if let Some(old) = slot.take() {
        old.stop();
    }

    let mut health = live.1.lock().unwrap_or_else(|e| e.into_inner());
    *health = WatchStatus::default();
    let state = LocalState::load(&LocalState::default_path());
    let mut dirs: Vec<PathBuf> = state.watched_folders.iter().map(PathBuf::from).collect();
    if dirs.is_empty() {
        return;
    }
    let router = ChangeRouter::new(&dirs);
    let sessions = crate::user_home().join(".claude").join("projects");
    if sessions.is_dir() {
        dirs.push(sessions.clone());
    }

    let (mut watcher, stopper) = match DirWatcher::new(DEBOUNCE, MAX_WAIT) {
        Ok(value) => value,
        Err(error) => {
            health.errors.push(error.to_string());
            return;
        }
    };
    for dir in &dirs {
        match watcher.watch(dir) {
            Ok(()) => {
                if dir != &sessions {
                    health.watching.push(dir.display().to_string());
                }
            }
            Err(error) => health.errors.push(format!("{}: {error}", dir.display())),
        }
    }
    *slot = Some(stopper);

    let app = app.clone();
    std::thread::spawn(move || {
        while let Some(batch) = watcher.next_batch() {
            if let Some(runner) = app.try_state::<CommandRunner>() {
                for path in &batch {
                    if let Some(project) = router.route(path) {
                        runner.changed(project);
                    }
                }
            }
            for path in &batch {
                if let Some(project) = router.pushed_project(path) {
                    crate::github_source::pushed(&app, project);
                }
            }
            let _ = app.emit(CHANGED_EVENT, ());
        }
    });
}
