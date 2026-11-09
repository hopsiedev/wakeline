//! Vista de las mismas fuentes que muestra la app, compartida por cualquier cliente MCP.

use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use serde_json::{Value, json};
use wakeline_core::docs;
use wakeline_core::sessions::{cards_from_events, claude};
use wakeline_core::store::LocalState;
use wakeline_core::watch::is_within;
use wakeline_core::{CardStatus, Fingerprint, SourceKind};

fn home_dir() -> PathBuf {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

fn project_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.display().to_string())
}

pub fn watched_project<'a>(state: &'a LocalState, cwd: &str) -> Option<&'a str> {
    state
        .watched_folders
        .iter()
        .filter(|root| is_within(root, cwd))
        .max_by_key(|root| root.len())
        .map(String::as_str)
}

pub fn scan_cards(state: &LocalState) -> Vec<Value> {
    let mut cards = Vec::new();
    if state.watched_folders.is_empty() {
        return cards;
    }

    let sessions_root = home_dir().join(".claude").join("projects");
    let cutoff = SystemTime::now() - Duration::from_secs(30 * 24 * 3600);
    let mut events = Vec::new();
    for file in claude::discover(&sessions_root).unwrap_or_default() {
        if std::fs::metadata(&file.path)
            .and_then(|metadata| metadata.modified())
            .ok()
            .is_some_and(|modified| modified < cutoff)
        {
            continue;
        }
        if let Ok(read) = claude::read_from(&file.path, 0) {
            events.extend(read.events.into_iter().filter(|event| {
                event
                    .cwd
                    .as_deref()
                    .is_some_and(|cwd| watched_project(state, cwd).is_some())
            }));
        }
    }

    for card in cards_from_events(&events) {
        let Some(root) = card
            .cwd
            .as_deref()
            .and_then(|cwd| watched_project(state, cwd))
        else {
            continue;
        };
        let fingerprint = card.fingerprint.as_str();
        cards.push(json!({
            "fingerprint": fingerprint,
            "kind": card.kind,
            "status": state.status_for(fingerprint),
            "title": card.title,
            "project": project_name(Path::new(root)),
            "source": "session",
            "session_id": card.session_id,
            "evidence": card.evidence,
            "occurrences": card.occurrences,
        }));
    }

    for root in &state.watched_folders {
        let path = Path::new(root);
        for card in docs::scan_project_docs(path).unwrap_or_default() {
            let source_identity = format!("{}:{}", path.display(), card.location);
            let fingerprint = Fingerprint::new(
                card.kind,
                SourceKind::Document,
                Some(&source_identity),
                &card.title,
            );
            let fingerprint = fingerprint.as_str();
            cards.push(json!({
                "fingerprint": fingerprint,
                "kind": card.kind,
                "status": state.status_for(fingerprint),
                "title": card.title,
                "project": project_name(path),
                "source": "document",
                "location": card.location,
            }));
        }
    }

    for card in &state.manual_cards {
        if !state
            .watched_folders
            .iter()
            .any(|root| project_name(Path::new(root)) == card.project)
        {
            continue;
        }
        cards.push(json!({
            "fingerprint": card.fingerprint,
            "kind": card.kind,
            "status": state.status_for(&card.fingerprint),
            "title": card.title,
            "project": card.project,
            "source": "manual",
        }));
    }

    cards
}

pub fn open_cards(cards: Vec<Value>) -> Vec<Value> {
    cards
        .into_iter()
        .filter(|card| {
            matches!(
                serde_json::from_value::<CardStatus>(card["status"].clone()),
                Ok(CardStatus::New | CardStatus::Accepted)
            )
        })
        .collect()
}
