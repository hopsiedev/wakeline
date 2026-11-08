//! Fuentes de sesiones de agentes de IA. En la 0.1 solo Claude Code; Cursor,
//! Antigravity y OpenCode llegan en la 0.2 como nuevos módulos.

pub mod claude;

use std::collections::HashMap;

use crate::card::{CardKind, SourceKind};
use crate::detect::find_in_assistant_text;
use crate::fingerprint::Fingerprint;
use crate::redact::redact;
use claude::{EventKind, SessionEvent};

/// Un error de comando cuenta como tarjeta a partir de esta cantidad de apariciones.
pub const MIN_REPEATED_ERRORS: u32 = 2;

/// Una tarjeta sacada de las sesiones, todavía sin guardar.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionCard {
    pub fingerprint: Fingerprint,
    pub kind: CardKind,
    pub title: String,
    /// Carpeta del proyecto según el campo `cwd` de la sesión.
    pub cwd: Option<String>,
    pub git_branch: Option<String>,
    pub session_id: String,
    pub occurrences: u32,
    pub first_seen: Option<String>,
    pub last_seen: Option<String>,
}

/// Convierte eventos en tarjetas, sin duplicados:
/// - frases de pendientes e ideas de las respuestas finales;
/// - errores de comandos repetidos al menos [`MIN_REPEATED_ERRORS`] veces.
pub fn cards_from_events<'a>(
    events: impl IntoIterator<Item = &'a SessionEvent>,
) -> Vec<SessionCard> {
    let mut cards: Vec<SessionCard> = Vec::new();
    let mut index: HashMap<Fingerprint, usize> = HashMap::new();

    let mut add = |kind: CardKind, title: String, event: &SessionEvent| {
        let title = redact(&title);
        let fingerprint = Fingerprint::new(kind, SourceKind::Session, None, &title);
        if let Some(&i) = index.get(&fingerprint) {
            let card = &mut cards[i];
            card.occurrences += 1;
            if event.timestamp > card.last_seen {
                card.last_seen.clone_from(&event.timestamp);
            }
            if card.first_seen.is_none() || event.timestamp < card.first_seen {
                card.first_seen.clone_from(&event.timestamp);
            }
        } else {
            index.insert(fingerprint.clone(), cards.len());
            cards.push(SessionCard {
                fingerprint,
                kind,
                title,
                cwd: event.cwd.clone(),
                git_branch: event.git_branch.clone(),
                session_id: event.session_id.clone(),
                occurrences: 1,
                first_seen: event.timestamp.clone(),
                last_seen: event.timestamp.clone(),
            });
        }
    };

    for event in events {
        match &event.kind {
            EventKind::FinalText(text) => {
                for finding in find_in_assistant_text(text) {
                    add(finding.kind, finding.text, event);
                }
            }
            EventKind::ToolError { message, .. } => add(CardKind::Error, message.clone(), event),
        }
    }

    cards.retain(|c| c.kind != CardKind::Error || c.occurrences >= MIN_REPEATED_ERRORS);
    cards
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event(kind: EventKind, ts: &str) -> SessionEvent {
        SessionEvent {
            session_id: "s1".into(),
            timestamp: Some(ts.into()),
            cwd: Some(r"C:\proj".into()),
            git_branch: Some("main".into()),
            kind,
        }
    }

    fn error(msg: &str, ts: &str) -> SessionEvent {
        event(
            EventKind::ToolError {
                tool: Some("Bash".into()),
                message: msg.into(),
            },
            ts,
        )
    }

    #[test]
    fn a_single_command_error_is_not_a_card() {
        let events = [error(
            "error TS2304: Cannot find name 'x'",
            "2026-11-08T10:00:00Z",
        )];
        assert!(cards_from_events(&events).is_empty());
    }

    #[test]
    fn repeated_command_errors_become_one_error_card() {
        let events = [
            error(
                "a.ts(3,1): error TS2304: Cannot find name 'x'",
                "2026-11-08T10:00:00Z",
            ),
            error(
                "a.ts(9,4): error TS2304: Cannot find name 'x'",
                "2026-11-08T11:00:00Z",
            ),
        ];
        let cards = cards_from_events(&events);
        assert_eq!(cards.len(), 1);
        assert_eq!(cards[0].kind, CardKind::Error);
        assert_eq!(cards[0].occurrences, 2);
        assert_eq!(cards[0].first_seen.as_deref(), Some("2026-11-08T10:00:00Z"));
        assert_eq!(cards[0].last_seen.as_deref(), Some("2026-11-08T11:00:00Z"));
    }

    #[test]
    fn pending_work_in_final_answers_becomes_task_cards() {
        let events = [event(
            EventKind::FinalText("Listo. Queda pendiente probar la caja sin conexión.".into()),
            "2026-11-08T10:00:00Z",
        )];
        let cards = cards_from_events(&events);
        assert_eq!(cards.len(), 1);
        assert_eq!(cards[0].kind, CardKind::Task);
        assert_eq!(cards[0].cwd.as_deref(), Some(r"C:\proj"));
    }

    #[test]
    fn secrets_never_reach_a_card() {
        let events = [event(
            EventKind::FinalText("Queda pendiente rotar la clave ghp_abcdefghijklmnop1234.".into()),
            "2026-11-08T10:00:00Z",
        )];
        let cards = cards_from_events(&events);
        assert!(!cards[0].title.contains("abcdefghijklmnop1234"));
    }
}
