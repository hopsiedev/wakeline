//! Núcleo de Wakeline: tarjetas, huellas para deduplicar, fuentes (sesiones de
//! Claude Code y documentos) y almacenamiento local.

pub mod account;
pub mod alerts;
pub mod card;
pub mod detect;
pub mod docs;
pub mod exclusions;
pub mod fingerprint;
pub mod redact;
pub mod sessions;
pub mod store;

pub use card::{CardKind, CardStatus, SourceKind};
pub use fingerprint::Fingerprint;
