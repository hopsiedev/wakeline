//! Almacenamiento local en `%APPDATA%\wakeline\state.json` y exportación manual a `docs/TODO.md`.
//!
//! En la versión 0.1 el estado persiste en `state.json` (decisión Q37; la migración a
//! SQLite queda para la 0.2). Guarda las carpetas vigiladas, las decisiones del usuario
//! (tarjetas aceptadas, hechas o descartadas) y las tarjetas creadas a mano o desde el
//! servidor MCP, indexadas por huella estable.

use std::collections::{HashMap, HashSet};
use std::io;
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
        // Las tarjetas antiguas pertenecían a proyectos fijados en el código.
        // Al pasar a carpetas elegidas, empezamos sin proyectos ni decisiones heredadas.
        if state.config_version == 0 {
            state.statuses.clear();
            state.manual_cards.clear();
            state.watched_folders.clear();
            state.session_offsets.clear();
            state.session_file_cards.clear();
            state.config_version = 1;
        }
        state
    }

    pub fn save(&self, path: &Path) -> io::Result<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(self).map_err(io::Error::other)?;
        std::fs::write(path, json)
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
    fn old_state_starts_with_no_watched_folders_or_cards() {
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
        assert!(state.statuses.is_empty());
        assert!(state.manual_cards.is_empty());
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
