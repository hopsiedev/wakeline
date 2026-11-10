//! Fuentes de sesiones de agentes de IA. En la 0.1 solo Claude Code; Cursor,
//! Antigravity y OpenCode llegan en la 0.2 como nuevos módulos.

pub mod claude;

use std::collections::HashMap;
use std::io;

use serde::{Deserialize, Serialize};

use crate::card::{CardKind, SourceKind};
use crate::detect::find_in_assistant_text;
use crate::fingerprint::Fingerprint;
use crate::redact::redact;
use crate::store::LocalState;
use claude::{EventKind, SessionEvent, SessionFile};

/// Un error de comando cuenta como tarjeta a partir de esta cantidad de apariciones.
pub const MIN_REPEATED_ERRORS: u32 = 2;

/// Una tarjeta sacada de las sesiones, todavía sin guardar.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SessionCard {
    pub fingerprint: Fingerprint,
    pub kind: CardKind,
    pub title: String,
    /// Fragmento de la respuesta o salida original que originó la tarjeta.
    pub evidence: Option<String>,
    /// Carpeta del proyecto según el campo `cwd` de la sesión.
    pub cwd: Option<String>,
    pub git_branch: Option<String>,
    pub session_id: String,
    pub occurrences: u32,
    pub first_seen: Option<String>,
    pub last_seen: Option<String>,
}

/// Resultado de un escaneo incremental de archivos de sesión.
#[derive(Debug, Default)]
pub struct IncrementalScanReport {
    /// Cantidad de archivos revisados.
    pub files_scanned: usize,
    /// Bytes nuevos leídos desde el último offset guardado (0 si nada cambió).
    pub bytes_read: u64,
    /// Líneas JSON inválidas encontradas en los tramos nuevos.
    pub bad_lines: usize,
    /// Eventos nuevos extraídos en esta pasada.
    pub events_read: usize,
    /// Tarjetas consolidadas entre los archivos indicados.
    pub cards: Vec<SessionCard>,
}

/// Acumula eventos en un vector de tarjetas (sin filtrar todavía por `MIN_REPEATED_ERRORS`).
pub fn ingest_events<'a>(
    cards: &mut Vec<SessionCard>,
    events: impl IntoIterator<Item = &'a SessionEvent>,
) {
    let mut index: HashMap<Fingerprint, usize> = cards
        .iter()
        .enumerate()
        .map(|(i, c)| (c.fingerprint.clone(), i))
        .collect();

    let mut add = |kind: CardKind, title: String, evidence: &str, event: &SessionEvent| {
        let title = redact(&title);
        let evidence = redact(&evidence.chars().take(2000).collect::<String>());
        let fingerprint = Fingerprint::new(kind, SourceKind::Session, event.cwd.as_deref(), &title);
        if let Some(&i) = index.get(&fingerprint) {
            let card = &mut cards[i];
            card.occurrences += 1;
            if event.timestamp > card.last_seen {
                card.last_seen.clone_from(&event.timestamp);
            }
            if card.first_seen.is_none() || event.timestamp < card.first_seen {
                card.first_seen.clone_from(&event.timestamp);
            }
            if card.git_branch.is_none() && event.git_branch.is_some() {
                card.git_branch.clone_from(&event.git_branch);
            }
            if card.cwd.is_none() && event.cwd.is_some() {
                card.cwd.clone_from(&event.cwd);
            }
            if card.evidence.is_none() && !evidence.is_empty() {
                card.evidence = Some(evidence);
            }
        } else {
            index.insert(fingerprint.clone(), cards.len());
            cards.push(SessionCard {
                fingerprint,
                kind,
                title,
                evidence: (!evidence.is_empty()).then_some(evidence),
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
                    add(finding.kind, finding.text, text, event);
                }
            }
            EventKind::ToolError {
                message, output, ..
            } => add(CardKind::Error, message.clone(), output, event),
        }
    }
}

fn merge_session_card(
    cards: &mut Vec<SessionCard>,
    index: &mut HashMap<Fingerprint, usize>,
    incoming: SessionCard,
) {
    if let Some(&i) = index.get(&incoming.fingerprint) {
        let card = &mut cards[i];
        card.occurrences += incoming.occurrences;
        if incoming.last_seen > card.last_seen {
            card.last_seen = incoming.last_seen;
        }
        if card.first_seen.is_none()
            || (incoming.first_seen.is_some() && incoming.first_seen < card.first_seen)
        {
            card.first_seen = incoming.first_seen;
        }
        if card.git_branch.is_none() && incoming.git_branch.is_some() {
            card.git_branch = incoming.git_branch;
        }
        if card.cwd.is_none() && incoming.cwd.is_some() {
            card.cwd = incoming.cwd;
        }
        if card.evidence.is_none() && incoming.evidence.is_some() {
            card.evidence = incoming.evidence;
        }
    } else {
        index.insert(incoming.fingerprint.clone(), cards.len());
        cards.push(incoming);
    }
}

/// Convierte eventos en tarjetas, sin duplicados:
/// - frases de pendientes e ideas de las respuestas finales;
/// - errores de comandos repetidos al menos [`MIN_REPEATED_ERRORS`] veces.
pub fn cards_from_events<'a>(
    events: impl IntoIterator<Item = &'a SessionEvent>,
) -> Vec<SessionCard> {
    let mut cards: Vec<SessionCard> = Vec::new();
    ingest_events(&mut cards, events);
    cards.retain(|c| c.kind != CardKind::Error || c.occurrences >= MIN_REPEATED_ERRORS);
    cards
}

/// Escanea una lista de archivos de sesión de forma incremental reutilizando los offsets
/// guardados en `state`. Procesa cada archivo por separado sin acumular todos los eventos
/// en memoria, y si un archivo es menor que su offset guardado lo relee desde 0.
pub fn scan_files_incremental(
    files: &[SessionFile],
    state: &mut LocalState,
) -> io::Result<IncrementalScanReport> {
    scan_files_incremental_with_progress(files, state, |_, _| {})
}

pub fn scan_files_incremental_with_progress(
    files: &[SessionFile],
    state: &mut LocalState,
    mut on_progress: impl FnMut(usize, usize),
) -> io::Result<IncrementalScanReport> {
    let mut report = IncrementalScanReport {
        files_scanned: files.len(),
        ..Default::default()
    };
    let mut merged: Vec<SessionCard> = Vec::new();
    let mut merged_index: HashMap<Fingerprint, usize> = HashMap::new();

    on_progress(0, files.len());
    for (file_index, file) in files.iter().enumerate() {
        let key = file.path.to_string_lossy().into_owned();
        let file_len = std::fs::metadata(&file.path)?.len();
        let saved_offset = state.session_offsets.get(&key).copied().unwrap_or(0);
        let has_cached_cards = state.session_file_cards.contains_key(&key);

        let (start_offset, mut file_cards) =
            if saved_offset == 0 || file_len < saved_offset || !has_cached_cards {
                (0, Vec::new())
            } else {
                (
                    saved_offset,
                    state
                        .session_file_cards
                        .get(&key)
                        .cloned()
                        .unwrap_or_default(),
                )
            };

        if start_offset < file_len || start_offset == 0 {
            let read = claude::read_from(&file.path, start_offset)?;
            let delta = read.offset.saturating_sub(start_offset);
            report.bytes_read += delta;
            report.bad_lines += read.bad_lines;
            report.events_read += read.events.len();
            ingest_events(&mut file_cards, &read.events);
            state.session_offsets.insert(key.clone(), read.offset);
            state.session_file_cards.insert(key, file_cards.clone());
        }

        for card in file_cards {
            merge_session_card(&mut merged, &mut merged_index, card);
        }
        on_progress(file_index + 1, files.len());
    }

    merged.retain(|c| c.kind != CardKind::Error || c.occurrences >= MIN_REPEATED_ERRORS);
    report.cards = merged;
    Ok(report)
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
                output: msg.into(),
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
        assert!(
            cards[0]
                .evidence
                .as_deref()
                .is_some_and(|evidence| evidence.contains("TS2304"))
        );
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
    fn identical_tasks_in_different_folders_stay_separate() {
        let first = event(
            EventKind::FinalText("Queda pendiente arreglar el botón de guardar.".into()),
            "2026-11-08T10:00:00Z",
        );
        let mut second = first.clone();
        second.cwd = Some(r"C:\other-project".into());
        let cards = cards_from_events(&[first, second]);
        assert_eq!(cards.len(), 2);
    }

    #[test]
    fn secrets_never_reach_a_card() {
        let events = [event(
            EventKind::FinalText("Queda pendiente rotar la clave ghp_abcdefghijklmnop1234.".into()),
            "2026-11-08T10:00:00Z",
        )];
        let cards = cards_from_events(&events);
        assert!(!cards[0].title.contains("abcdefghijklmnop1234"));
        assert!(
            !cards[0]
                .evidence
                .as_deref()
                .unwrap_or_default()
                .contains("abcdefghijklmnop1234")
        );
    }

    #[test]
    fn incremental_scan_persists_offsets_skips_unchanged_and_rereads_truncated() {
        let path =
            std::env::temp_dir().join(format!("wakeline-inc-session-{}.jsonl", std::process::id()));
        let line1 = r#"{"type":"assistant","sessionId":"s1","cwd":"C:\\proj","gitBranch":"main","timestamp":"2026-11-08T10:00:00Z","message":{"stop_reason":"end_turn","content":[{"type":"text","text":"Queda pendiente revisar el cierre de mes."}]}}"#;
        let line2 = r#"{"type":"assistant","sessionId":"s1","cwd":"C:\\proj","gitBranch":"main","timestamp":"2026-11-08T11:00:00Z","message":{"stop_reason":"end_turn","content":[{"type":"text","text":"Queda pendiente revisar el cierre de mes."}]}}"#;
        let initial_content = format!("{line1}\n");
        std::fs::write(&path, &initial_content).unwrap();

        let files = [SessionFile {
            path: path.clone(),
            is_subagent: false,
        }];
        let mut state = LocalState::default();

        // 1. Primera lectura: lee todo el archivo y guarda el offset.
        let first = scan_files_incremental(&files, &mut state).unwrap();
        assert_eq!(first.bytes_read, initial_content.len() as u64);
        assert_eq!(first.cards.len(), 1);
        assert_eq!(first.cards[0].occurrences, 1);

        // 2. Segunda lectura sin cambios: 0 bytes releídos y conserva las tarjetas.
        let second = scan_files_incremental(&files, &mut state).unwrap();
        assert_eq!(second.bytes_read, 0);
        assert_eq!(second.events_read, 0);
        assert_eq!(second.cards.len(), 1);
        assert_eq!(second.cards[0].occurrences, 1);

        // 3. Crecimiento incremental: solo lee los bytes nuevos y suma ocurrencias.
        let appended_content = format!("{line1}\n{line2}\n");
        std::fs::write(&path, &appended_content).unwrap();
        let third = scan_files_incremental(&files, &mut state).unwrap();
        assert_eq!(third.bytes_read, (line2.len() + 1) as u64);
        assert_eq!(third.cards.len(), 1);
        assert_eq!(third.cards[0].occurrences, 2);

        // 4. Archivo truncado/rotado (más corto que el offset guardado): relee entero desde 0.
        let truncated_line = r#"{"type":"assistant","sessionId":"s2","cwd":"C:\\proj","gitBranch":"main","timestamp":"2026-11-09T09:00:00Z","message":{"stop_reason":"end_turn","content":[{"type":"text","text":"Falta añadir prueba de humo."}]}}"#;
        let truncated_content = format!("{truncated_line}\n");
        assert!(truncated_content.len() < appended_content.len());
        std::fs::write(&path, &truncated_content).unwrap();

        let fourth = scan_files_incremental(&files, &mut state).unwrap();
        let _ = std::fs::remove_file(&path);
        assert_eq!(fourth.bytes_read, truncated_content.len() as u64);
        assert_eq!(fourth.cards.len(), 1);
        assert!(fourth.cards[0].title.contains("prueba de humo"));
        assert_eq!(fourth.cards[0].occurrences, 1);
    }

    #[test]
    fn history_progress_keeps_decisions_and_does_not_duplicate_on_refresh() {
        let path =
            std::env::temp_dir().join(format!("wakeline-history-{}.jsonl", std::process::id()));
        std::fs::write(&path, "{\"type\":\"assistant\",\"sessionId\":\"old\",\"cwd\":\"C:/watched\",\"message\":{\"stop_reason\":\"end_turn\",\"content\":[{\"type\":\"text\",\"text\":\"Queda pendiente revisar el cierre.\"}]}}\n").unwrap();
        let file = SessionFile {
            path: path.clone(),
            is_subagent: false,
        };
        assert!(claude::belongs_to_watched(&file, &["C:/watched".into()]).unwrap());
        assert!(!claude::belongs_to_watched(&file, &["C:/other".into()]).unwrap());
        let mut state = LocalState {
            config_version: 1,
            ..Default::default()
        };
        let mut progress = Vec::new();
        let report = scan_files_incremental_with_progress(
            std::slice::from_ref(&file),
            &mut state,
            |done, total| progress.push((done, total)),
        )
        .unwrap();
        assert_eq!(progress, [(0, 1), (1, 1)]);
        assert_eq!(report.cards.len(), 1);
        let fingerprint = report.cards[0].fingerprint.as_str().to_string();
        state.set_status(fingerprint.clone(), crate::CardStatus::Accepted);
        state.full_session_history = true;
        let state_path = path.with_extension("state.json");
        state.save(&state_path).unwrap();
        let mut restored = LocalState::load(&state_path);
        assert!(restored.full_session_history);
        let next = scan_files_incremental(&[file], &mut restored).unwrap();
        assert_eq!(next.bytes_read, 0);
        assert_eq!(next.cards[0].occurrences, 1);
        assert_eq!(
            restored.status_for(&fingerprint),
            crate::CardStatus::Accepted
        );
        std::fs::remove_file(path).unwrap();
        std::fs::remove_file(state_path).unwrap();
    }
}
