//! Núcleo de Wakeline: tarjetas, huellas para deduplicar, fuentes (sesiones de
//! Claude Code y documentos) y almacenamiento local.

pub mod account;
pub mod alerts;
pub mod card;
pub mod code;
pub mod commands;
pub mod detect;
pub mod docs;
pub mod exclusions;
pub mod fingerprint;
pub mod github;
pub mod github_workspace;
pub mod redact;
pub mod sessions;
pub mod signals;
pub mod store;
pub mod watch;
pub mod watcher;

pub use card::{CardKind, CardStatus, SourceKind};
pub use fingerprint::Fingerprint;

pub mod agents;

pub mod intelligence;
