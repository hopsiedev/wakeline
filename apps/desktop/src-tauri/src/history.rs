use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use wakeline_core::sessions::{claude, scan_files_incremental_with_progress};
use wakeline_core::store::LocalState;

static IMPORTING: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Serialize)]
struct Progress {
    processed: usize,
    total: usize,
}

#[derive(Serialize)]
pub struct ImportResult {
    files: usize,
    bad_lines: usize,
}

#[tauri::command]
pub fn history_import_status() -> bool {
    let _guard = crate::STATE_ACCESS
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    LocalState::load(&LocalState::default_path()).full_session_history
}

#[tauri::command]
pub async fn import_all_history(app: AppHandle) -> Result<ImportResult, String> {
    if IMPORTING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("HISTORY_IMPORT_RUNNING".into());
    }
    struct Reset;
    impl Drop for Reset {
        fn drop(&mut self) {
            IMPORTING.store(false, Ordering::SeqCst);
        }
    }
    let reset = Reset;
    tauri::async_runtime::spawn_blocking(move || {
        let _reset = reset;
        let path = LocalState::default_path();
        let mut state = {
            let _guard = crate::STATE_ACCESS
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            LocalState::load(&path)
        };
        if state.watched_folders.is_empty() {
            return Err("NO_WATCHED_FOLDERS".into());
        }
        let initial_offsets = state.session_offsets.clone();
        let root = crate::user_home().join(".claude/projects");
        let mut files = Vec::new();
        if root.is_dir() {
            for file in claude::discover(&root).map_err(|error| error.to_string())? {
                if claude::belongs_to_watched(&file, &state.watched_folders)
                    .map_err(|error| error.to_string())?
                {
                    files.push(file);
                }
            }
        }
        let report =
            scan_files_incremental_with_progress(&files, &mut state, |processed, total| {
                let _ = app.emit("wakeline://history-progress", Progress { processed, total });
            })
            .map_err(|error| error.to_string())?;
        {
            let _guard = crate::STATE_ACCESS
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            let mut latest = LocalState::load(&path);
            for file in &files {
                let key = file.path.to_string_lossy().into_owned();
                if latest.session_offsets.get(&key) == initial_offsets.get(&key)
                    || latest.session_offsets.get(&key) <= state.session_offsets.get(&key)
                {
                    if let Some(offset) = state.session_offsets.get(&key) {
                        latest.session_offsets.insert(key.clone(), *offset);
                    }
                    if let Some(cards) = state.session_file_cards.remove(&key) {
                        latest.session_file_cards.insert(key, cards);
                    }
                }
            }
            latest.full_session_history = true;
            latest.save(&path).map_err(|error| error.to_string())?;
        }
        let _ = app.emit(crate::live::CHANGED_EVENT, ());
        Ok(ImportResult {
            files: files.len(),
            bad_lines: report.bad_lines,
        })
    })
    .await
    .map_err(|error| error.to_string())?
}
