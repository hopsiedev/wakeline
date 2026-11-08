//! Núcleo de Wakeline: tarjetas, huellas para deduplicar y, más adelante, las
//! fuentes (código, sesiones de IA, documentos y GitHub) y el almacenamiento.

pub mod card;
pub mod fingerprint;

pub use card::{CardKind, CardStatus, SourceKind};
pub use fingerprint::Fingerprint;
