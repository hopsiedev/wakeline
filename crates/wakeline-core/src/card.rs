use serde::{Deserialize, Serialize};

/// Tipo de tarjeta.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CardKind {
    Error,
    Task,
    Idea,
}

/// Estado de una tarjeta. Solo las tarjetas que vienen de señales se cierran solas.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CardStatus {
    New,
    Accepted,
    Done,
    Dismissed,
}

/// De dónde salió una aparición de la tarjeta.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceKind {
    /// Comentario `TODO`/`FIXME` en el código.
    Comment,
    /// Salida de un comando configurado (por ejemplo `tsc`).
    Command,
    /// Sesión de un agente de IA.
    Session,
    /// Documento del repo (`specs/`, hoja de ruta).
    Document,
    /// Pull request de GitHub.
    PullRequest,
    /// Issue de GitHub.
    Issue,
}

impl SourceKind {
    /// Las tarjetas de estas fuentes se cierran solas cuando la señal desaparece.
    pub fn auto_resolves(self) -> bool {
        matches!(
            self,
            Self::Comment | Self::Command | Self::PullRequest | Self::Issue
        )
    }

    pub(crate) fn tag(self) -> &'static str {
        match self {
            Self::Comment => "comment",
            Self::Command => "command",
            Self::Session => "session",
            Self::Document => "document",
            Self::PullRequest => "pr",
            Self::Issue => "issue",
        }
    }
}

impl CardKind {
    pub(crate) fn tag(self) -> &'static str {
        match self {
            Self::Error => "error",
            Self::Task => "task",
            Self::Idea => "idea",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sessions_and_documents_need_a_human_to_close() {
        assert!(!SourceKind::Session.auto_resolves());
        assert!(!SourceKind::Document.auto_resolves());
        assert!(SourceKind::Command.auto_resolves());
        assert!(SourceKind::Issue.auto_resolves());
    }

    #[test]
    fn enums_serialize_in_snake_case() {
        assert_eq!(
            serde_json::to_string(&SourceKind::PullRequest).unwrap(),
            "\"pull_request\""
        );
        assert_eq!(
            serde_json::to_string(&CardStatus::Dismissed).unwrap(),
            "\"dismissed\""
        );
    }
}
