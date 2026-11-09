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
struct Live(Mutex<Option<Stopper>>);

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

    let state = LocalState::load(&LocalState::default_path());
    let mut dirs: Vec<PathBuf> = state
        .watched_folders
        .iter()
        .map(PathBuf::from)
        .filter(|p| p.is_dir())
        .collect();
    if dirs.is_empty() {
        return;
    }
    let router = ChangeRouter::new(&dirs);
    let sessions = crate::user_home().join(".claude").join("projects");
    if sessions.is_dir() {
        dirs.push(sessions);
    }

    let Ok((mut watcher, stopper)) = DirWatcher::new(DEBOUNCE, MAX_WAIT) else {
        return;
    };
    for dir in &dirs {
        let _ = watcher.watch(dir);
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
            let _ = app.emit(CHANGED_EVENT, ());
        }
    });
}
