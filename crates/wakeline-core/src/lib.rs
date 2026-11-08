//! Núcleo de Wakeline: tarjetas, huellas para deduplicar, fuentes (por ahora las
//! sesiones de Claude Code) y, más adelante, el almacenamiento.

pub mod card;
pub mod detect;
pub mod exclusions;
pub mod fingerprint;
pub mod redact;
pub mod sessions;

pub use card::{CardKind, CardStatus, SourceKind};
pub use fingerprint::Fingerprint;
