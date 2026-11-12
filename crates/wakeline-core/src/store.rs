//! Almacenamiento local en `%APPDATA%\wakeline\state.json` y exportación manual a `docs/TODO.md`.
//!
//! En la versión 0.1 el estado persiste en `state.json` (decisión Q37; la migración a
//! SQLite queda para la 0.2). Guarda las carpetas vigiladas, las decisiones del usuario
//! (tarjetas aceptadas, hechas o descartadas) y las tarjetas creadas a mano o desde el
//! servidor MCP, indexadas por huella estable.

use std::collections::{HashMap, HashSet};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::card::{CardKind, CardStatus};
use crate::sessions::SessionCard;
use crate::signals::SignalMemo;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManualCard {
    pub fingerprint: String,
    pub kind: CardKind,
    pub title: String,
    pub project: String,
    pub branch: Option<String>,
    pub created_at: String,
    /// Created by an agent for a project that is not watched; To do still shows it.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub unwatched: bool,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct LocalState {
    #[serde(default)]
    pub config_version: u8,
    #[serde(default)]
    pub watched_folders: Vec<String>,
    /// Historial completo solicitado explícitamente por el usuario.
    #[serde(default)]
    pub full_session_history: bool,
    #[serde(default)]
    pub statuses: HashMap<String, CardStatus>,
    #[serde(default)]
    pub manual_cards: Vec<ManualCard>,
    /// Offset en bytes alcanzado en cada archivo de sesión (`ruta -> offset`).
    #[serde(default)]
    pub session_offsets: HashMap<String, u64>,
    /// Tarjetas acumuladas por cada archivo de sesión (`ruta -> tarjetas`).
    #[serde(default)]
    pub session_file_cards: HashMap<String, Vec<SessionCard>>,
    /// SHA-256 del `wakeline.toml` aprobado por proyecto (`ruta normalizada -> hash`).
    #[serde(default)]
    pub trusted_commands: HashMap<String, String>,
    /// Señales vistas por fuentes que se cierran solas (`huella -> memoria`).
    #[serde(default)]
    pub signals: HashMap<String, SignalMemo>,
    /// Huellas que Wakeline cerró sola; si reaparecen vuelven a «nueva» (Q47).
    #[serde(default)]
    pub auto_closed: HashSet<String>,
    /// Fields written by newer versions must survive a round trip.
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

impl LocalState {
    /// Ruta del archivo de estado en `%APPDATA%\wakeline\state.json`.
    pub fn default_path() -> PathBuf {
        let base = std::env::var_os("APPDATA")
            .or_else(|| std::env::var_os("USERPROFILE"))
            .or_else(|| std::env::var_os("HOME"))
            .map(PathBuf::from)
            .unwrap_or_else(std::env::temp_dir);
        base.join("wakeline").join("state.json")
    }

    pub fn load(path: &Path) -> Self {
        let mut state: Self = std::fs::read_to_string(path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        // An absent version is not permission to erase an existing installation.
        if state.config_version == 0 {
            state.config_version = 1;
        }
        state
    }

    pub fn save(&self, path: &Path) -> io::Result<()> {
        let parent = path
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or(Path::new("."));
        std::fs::create_dir_all(parent)?;
        match std::fs::read(path) {
            Ok(bytes) => {
                // Never replace an unreadable state with the loader's empty fallback.
                serde_json::from_slice::<Self>(&bytes).map_err(io::Error::other)?;
                let backup = path.with_extension("pre-refresh.json");
                if !backup.exists() {
                    let mut copy = tempfile::NamedTempFile::new_in(parent)?;
                    copy.write_all(&bytes)?;
                    copy.as_file().sync_all()?;
                    if let Err(error) = copy.persist_noclobber(&backup)
                        && error.error.kind() != io::ErrorKind::AlreadyExists
                    {
                        return Err(error.error);
                    }
                }
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
        let mut file = tempfile::NamedTempFile::new_in(parent)?;
        serde_json::to_writer_pretty(&mut file, self).map_err(io::Error::other)?;
        file.as_file().sync_all()?;
        file.persist(path).map_err(|error| error.error)?;
        Ok(())
    }

    pub fn status_for(&self, fingerprint: &str) -> CardStatus {
        self.statuses
            .get(fingerprint)
            .copied()
            .unwrap_or(CardStatus::New)
    }

    pub fn set_status(&mut self, fingerprint: String, status: CardStatus) {
        self.statuses.insert(fingerprint, status);
    }
}

/// Entrada lista para exportar a `docs/TODO.md`.
pub struct ExportItem<'a> {
    pub kind: CardKind,
    pub title: &'a str,
    pub origin: &'a str,
    pub status: CardStatus,
}

/// Genera el contenido de `docs/TODO.md` con las tarjetas abiertas (nuevas y aceptadas).
pub fn format_todo_markdown(project_name: &str, items: &[ExportItem<'_>]) -> String {
    let mut out = format!(
        "# TODO · {project_name}\n\nGenerado a mano desde Wakeline. Solo incluye tarjetas abiertas.\n\n"
    );
    for (kind, heading) in [
        (CardKind::Error, "## Errores"),
        (CardKind::Task, "## Tareas"),
        (CardKind::Idea, "## Ideas"),
    ] {
        let group: Vec<_> = items
            .iter()
            .filter(|i| {
                i.kind == kind && matches!(i.status, CardStatus::New | CardStatus::Accepted)
            })
            .collect();
        if group.is_empty() {
            continue;
        }
        out.push_str(heading);
        out.push('\n');
        for item in group {
            out.push_str(&format!("- [ ] {} _({})_\n", item.title, item.origin));
        }
        out.push('\n');
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn old_state_preserves_cards_and_decisions() {
        let path =
            std::env::temp_dir().join(format!("wakeline-old-state-{}.json", std::process::id()));
        std::fs::write(
            &path,
            r#"{"statuses":{"old":"accepted"},"manual_cards":[{"fingerprint":"old","kind":"task","title":"old task","project":"Contastack","branch":null,"created_at":"2026-11-08"}]}"#,
        )
        .unwrap();
        let state = LocalState::load(&path);
        let _ = std::fs::remove_file(path);
        assert_eq!(state.config_version, 1);
        assert!(state.watched_folders.is_empty());
        assert_eq!(state.status_for("old"), CardStatus::Accepted);
        assert_eq!(state.manual_cards.len(), 1);
    }

    #[test]
    fn upgrade_survives_two_restarts_and_preserves_unknown_fields() {
        let dir = std::env::temp_dir().join(format!("wakeline-upgrade-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("state.json");
        let original = r#"{"config_version":1,"watched_folders":["C:/projects/real"],"full_session_history":true,"statuses":{"stable-fingerprint":"done"},"session_offsets":{"session.jsonl":1048576},"trusted_commands":{"project":"approved-hash"},"future_field":{"nested":[1,2,3]}}"#;
        std::fs::write(&path, original).unwrap();
        for _ in 0..2 {
            let state = LocalState::load(&path);
            assert_eq!(state.watched_folders, ["C:/projects/real"]);
            assert_eq!(state.status_for("stable-fingerprint"), CardStatus::Done);
            assert_eq!(state.session_offsets["session.jsonl"], 1048576);
            assert!(state.full_session_history);
            assert_eq!(state.trusted_commands["project"], "approved-hash");
            state.save(&path).unwrap();
            let json: serde_json::Value =
                serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
            assert_eq!(json["future_field"], serde_json::json!({"nested": [1,2,3]}));
        }
        assert_eq!(
            std::fs::read_to_string(path.with_extension("pre-refresh.json")).unwrap(),
            original
        );
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn unreadable_state_cannot_be_overwritten_by_defaults() {
        let path =
            std::env::temp_dir().join(format!("wakeline-invalid-{}.json", std::process::id()));
        std::fs::write(&path, "{interrupted").unwrap();
        assert!(LocalState::load(&path).save(&path).is_err());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "{interrupted");
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn formats_open_cards_and_skips_dismissed_or_done() {
        let items = [
            ExportItem {
                kind: CardKind::Error,
                title: "Falla typecheck en estado.tsx",
                origin: "tsc",
                status: CardStatus::New,
            },
            ExportItem {
                kind: CardKind::Task,
                title: "Probar en el iPhone",
                origin: "Sesión IA",
                status: CardStatus::Accepted,
            },
            ExportItem {
                kind: CardKind::Task,
                title: "Descartada",
                origin: "Sesión IA",
                status: CardStatus::Dismissed,
            },
        ];
        let md = format_todo_markdown("Contastack", &items);
        assert!(md.contains("Falla typecheck en estado.tsx"));
        assert!(md.contains("Probar en el iPhone"));
        assert!(!md.contains("Descartada"));
    }
}
