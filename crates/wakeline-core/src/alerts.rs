//! Cuándo avisar con una notificación de Windows.
//!
//! - Solo por errores nuevos (ni tareas ni ideas).
//! - La primera revisión al abrir no avisa: solo aprende los errores que ya había.
//! - Como máximo un aviso cada [`COOLDOWN`]. Lo que llega mientras tanto se junta en
//!   el siguiente aviso.

use std::collections::HashSet;
use std::time::{Duration, Instant};

pub const COOLDOWN: Duration = Duration::from_secs(10 * 60);

/// PRs already delivered in this session, shared by manual and background refreshes.
/// Existing open PRs are eligible on startup; a failed delivery can be retried.
#[derive(Debug, Default)]
pub struct PullRequestTracker {
    delivered: HashSet<(String, u64)>,
}

impl PullRequestTracker {
    pub fn should_notify(&self, repo: &str, number: u64) -> bool {
        !self.delivered.contains(&(repo.to_string(), number))
    }

    pub fn delivered(&mut self, repo: &str, number: u64) {
        self.delivered.insert((repo.to_string(), number));
    }
}

/// Un error abierto visto en una revisión.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ErrorSeen {
    pub fingerprint: String,
    pub title: String,
    pub project: String,
}

/// Lo que hay que notificar.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Alert {
    One { title: String, project: String },
    Many { count: usize, latest_title: String },
}

#[derive(Debug, Default)]
pub struct AlertTracker {
    seen: HashSet<String>,
    pending: Vec<ErrorSeen>,
    last_sent: Option<Instant>,
    learned: bool,
}

impl AlertTracker {
    pub fn new() -> Self {
        Self::default()
    }

    /// Recibe los errores abiertos de una revisión y dice si toca avisar ahora.
    pub fn check(
        &mut self,
        errors: impl IntoIterator<Item = ErrorSeen>,
        now: Instant,
    ) -> Option<Alert> {
        let fresh: Vec<ErrorSeen> = errors
            .into_iter()
            .filter(|e| self.seen.insert(e.fingerprint.clone()))
            .collect();

        if !self.learned {
            // Primera revisión: lo que ya estaba no es nuevo.
            self.learned = true;
            return None;
        }

        self.pending.extend(fresh);
        if self.pending.is_empty() {
            return None;
        }
        if self
            .last_sent
            .is_some_and(|sent| now.duration_since(sent) < COOLDOWN)
        {
            return None;
        }

        self.last_sent = Some(now);
        let pending = std::mem::take(&mut self.pending);
        let latest = pending.last().expect("no está vacío").clone();
        Some(if pending.len() == 1 {
            Alert::One {
                title: latest.title,
                project: latest.project,
            }
        } else {
            Alert::Many {
                count: pending.len(),
                latest_title: latest.title,
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn existing_and_new_prs_are_notified_once_and_failed_delivery_can_retry() {
        let mut tracker = PullRequestTracker::default();
        assert!(tracker.should_notify("o/r", 12));
        // A failed delivery is not acknowledged and remains eligible.
        assert!(tracker.should_notify("o/r", 12));
        tracker.delivered("o/r", 12);
        assert!(!tracker.should_notify("o/r", 12));
        assert!(tracker.should_notify("o/r", 13));
        assert!(tracker.should_notify("other/repo", 12));
    }

    fn err(fp: &str) -> ErrorSeen {
        ErrorSeen {
            fingerprint: fp.into(),
            title: format!("error {fp}"),
            project: "Contastack".into(),
        }
    }

    #[test]
    fn the_first_check_only_learns() {
        let mut tracker = AlertTracker::new();
        let now = Instant::now();
        assert_eq!(tracker.check([err("a"), err("b")], now), None);
        // Siguen ahí, pero no son nuevos.
        assert_eq!(
            tracker.check([err("a"), err("b")], now + Duration::from_secs(60)),
            None
        );
    }

    #[test]
    fn a_new_error_is_announced_once() {
        let mut tracker = AlertTracker::new();
        let start = Instant::now();
        tracker.check([err("a")], start);

        let alert = tracker.check([err("a"), err("c")], start + Duration::from_secs(60));
        assert_eq!(
            alert,
            Some(Alert::One {
                title: "error c".into(),
                project: "Contastack".into()
            })
        );
        assert_eq!(
            tracker.check([err("a"), err("c")], start + Duration::from_secs(120)),
            None
        );
    }

    #[test]
    fn errors_during_the_cooldown_are_grouped_into_the_next_alert() {
        let mut tracker = AlertTracker::new();
        let start = Instant::now();
        tracker.check([], start);

        assert!(
            tracker
                .check([err("x")], start + Duration::from_secs(1))
                .is_some()
        );
        // Dentro de los 10 minutos: no avisa, guarda.
        assert_eq!(
            tracker.check([err("y")], start + Duration::from_secs(120)),
            None
        );
        assert_eq!(
            tracker.check([err("z")], start + Duration::from_secs(240)),
            None
        );
        // Pasado el tiempo: un solo aviso con los dos.
        let alert = tracker.check([], start + COOLDOWN + Duration::from_secs(2));
        assert_eq!(
            alert,
            Some(Alert::Many {
                count: 2,
                latest_title: "error z".into()
            })
        );
    }
}
