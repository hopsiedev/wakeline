//! What the MCP server may know about To Do without reading any project folder.
//!
//! The app writes the cards it shows after each scan; the MCP server reads this list
//! and `state.json`, and touches a signal file after a change so the app reloads.

use std::io::{self, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::card::{CardKind, CardStatus};
use crate::store::LocalState;

/// One To Do card as the app showed it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TodoEntry {
    pub fingerprint: String,
    /// Every fingerprint grouped into this card; a move applies to all of them.
    #[serde(default)]
    pub fingerprints: Vec<String>,
    pub short_id: String,
    pub title: String,
    pub kind: CardKind,
    pub status: CardStatus,
    pub project: String,
}

pub fn index_path() -> PathBuf {
    LocalState::default_path().with_file_name("todo-index.json")
}

/// File the MCP server touches after changing To Do.
pub fn signal_path() -> PathBuf {
    LocalState::default_path().with_file_name("mcp-changed")
}

pub fn load(path: &Path) -> Vec<TodoEntry> {
    std::fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

pub fn save(path: &Path, entries: &[TodoEntry]) -> io::Result<()> {
    let parent = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    std::fs::create_dir_all(parent)?;
    let mut file = tempfile::NamedTempFile::new_in(parent)?;
    serde_json::to_writer(&mut file, entries).map_err(io::Error::other)?;
    file.flush()?;
    file.persist(path).map_err(|error| error.error)?;
    Ok(())
}

/// Records a change; the app watches this file and reloads To Do.
pub fn signal(path: &Path) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    std::fs::write(path, nanos.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn index_round_trips_and_a_missing_file_is_empty() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("todo-index.json");
        assert!(load(&path).is_empty());
        let entry = TodoEntry {
            fingerprint: "fp".into(),
            fingerprints: vec!["fp".into(), "old".into()],
            short_id: "W-001".into(),
            title: "Fix the bug".into(),
            kind: CardKind::Task,
            status: CardStatus::New,
            project: "wakeline".into(),
        };
        save(&path, std::slice::from_ref(&entry)).unwrap();
        assert_eq!(load(&path), vec![entry]);
    }
}
