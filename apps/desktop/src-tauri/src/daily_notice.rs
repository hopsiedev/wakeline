//! Aviso de Windows con lo pendiente del día: uno por día local, al arrancar
//! (también con Windows, en segundo plano) o al cambiar de día con la app abierta.

use std::path::{Path, PathBuf};

use wakeline_core::{CardKind, CardStatus};

/// Tarjetas abiertas (nuevas o en curso), por tipo.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct Pending {
    pub errors: usize,
    pub tasks: usize,
    pub ideas: usize,
}

impl Pending {
    pub fn count<'a>(cards: impl IntoIterator<Item = (&'a CardKind, &'a CardStatus)>) -> Self {
        let mut pending = Self::default();
        for (kind, status) in cards {
            if !matches!(status, CardStatus::New | CardStatus::Accepted) {
                continue;
            }
            match kind {
                CardKind::Error => pending.errors += 1,
                CardKind::Task => pending.tasks += 1,
                CardKind::Idea => pending.ideas += 1,
            }
        }
        pending
    }

    fn total(&self) -> usize {
        self.errors + self.tasks + self.ideas
    }
}

/// Día local de Windows (`AAAA-MM-DD`): el día UTC cambiaría por la tarde en América.
pub fn local_day() -> String {
    #[cfg(windows)]
    {
        let now = unsafe { windows::Win32::System::SystemInformation::GetLocalTime() };
        format!("{:04}-{:02}-{:02}", now.wYear, now.wMonth, now.wDay)
    }
    #[cfg(not(windows))]
    {
        time::OffsetDateTime::now_utc().date().to_string()
    }
}

/// Archivo con el último día avisado, junto al estado.
pub fn marker_path() -> PathBuf {
    wakeline_core::store::LocalState::default_path().with_file_name("daily-notice")
}

/// Hay que avisar si hoy aún no se avisó y queda algo pendiente.
pub fn due(marker: &Path, today: &str, pending: &Pending) -> bool {
    pending.total() > 0
        && std::fs::read_to_string(marker)
            .map(|day| day.trim() != today)
            .unwrap_or(true)
}

pub fn mark(marker: &Path, today: &str) {
    let _ = std::fs::write(marker, today);
}

/// Título y texto del aviso. Solo nombra los tipos que tienen algo.
pub fn texts(pending: &Pending, spanish: bool) -> (String, String) {
    let parts: Vec<String> = [
        (pending.tasks, "tarea", "tareas", "task", "tasks"),
        (pending.errors, "error", "errores", "error", "errors"),
        (pending.ideas, "idea", "ideas", "idea", "ideas"),
    ]
    .into_iter()
    .filter(|(count, ..)| *count > 0)
    .map(|(count, es_one, es_many, en_one, en_many)| {
        let word = match (spanish, count == 1) {
            (true, true) => es_one,
            (true, false) => es_many,
            (false, true) => en_one,
            (false, false) => en_many,
        };
        format!("{count} {word}")
    })
    .collect();
    let (and, title) = if spanish {
        (" y ", "Lo que tienes para hoy")
    } else {
        (" and ", "Your day in Wakeline")
    };
    let list = match parts.split_last() {
        Some((last, [])) => last.clone(),
        Some((last, rest)) => format!("{}{and}{last}", rest.join(", ")),
        None => String::new(),
    };
    let body = if spanish {
        format!("Tienes {list} pendientes en To Do.")
    } else {
        format!("You have {list} pending in To Do.")
    };
    (title.to_string(), body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_only_open_cards() {
        let cards = [
            (CardKind::Task, CardStatus::New),
            (CardKind::Task, CardStatus::Accepted),
            (CardKind::Error, CardStatus::New),
            (CardKind::Idea, CardStatus::Done),
            (CardKind::Error, CardStatus::Dismissed),
        ];
        let pending = Pending::count(cards.iter().map(|(k, s)| (k, s)));
        assert_eq!(
            pending,
            Pending {
                errors: 1,
                tasks: 2,
                ideas: 0
            }
        );
    }

    #[test]
    fn notifies_once_per_day_and_only_with_pending_work() {
        let dir = tempfile::tempdir().unwrap();
        let marker = dir.path().join("daily-notice");
        let some = Pending {
            tasks: 1,
            ..Pending::default()
        };
        assert!(!due(&marker, "2026-11-12", &Pending::default()));
        assert!(due(&marker, "2026-11-12", &some));
        mark(&marker, "2026-11-12");
        assert!(!due(&marker, "2026-11-12", &some));
        assert!(due(&marker, "2026-11-13", &some));
    }

    #[test]
    fn text_names_only_what_is_pending() {
        let (title, body) = texts(
            &Pending {
                errors: 1,
                tasks: 2,
                ideas: 0,
            },
            true,
        );
        assert_eq!(title, "Lo que tienes para hoy");
        assert_eq!(body, "Tienes 2 tareas y 1 error pendientes en To Do.");
        let (_, body) = texts(
            &Pending {
                errors: 0,
                tasks: 1,
                ideas: 3,
            },
            false,
        );
        assert_eq!(body, "You have 1 task and 3 ideas pending in To Do.");
    }
}
