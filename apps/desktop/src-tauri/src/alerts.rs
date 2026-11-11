//! Notificaciones de Windows por errores nuevos.
//!
//! Una revisión en segundo plano cada [`CHECK_EVERY`] mira los errores abiertos, aunque la
//! ventana esté escondida en la bandeja. Las reglas de cuándo avisar viven en
//! `wakeline_core::alerts` (primera revisión sin avisos, como máximo uno cada 10 min).

use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;
use wakeline_core::alerts::{Alert, AlertTracker, ErrorSeen};
use wakeline_core::{CardKind, CardStatus};

use crate::shell;

#[cfg(windows)]
mod windows;

const CHECK_EVERY: Duration = Duration::from_secs(3 * 60);

/// Preferencias que manda la interfaz: si avisar y en qué idioma.
pub struct AlertPrefs {
    pub enabled: bool,
    pub errors: bool,
    pub pull_requests: bool,
    pub spanish: bool,
}

impl Default for AlertPrefs {
    fn default() -> Self {
        Self {
            enabled: true,
            errors: true,
            pull_requests: true,
            spanish: true,
        }
    }
}

/// Arranca la revisión periódica. Un clic en la notificación abre Wakeline.
pub fn start(app: &AppHandle) {
    app.manage(Mutex::new(AlertPrefs::default()));

    let on_click = app.clone();
    let _ = app
        .notification()
        .on_action(move |_| shell::show_main(&on_click));

    let app = app.clone();
    std::thread::spawn(move || {
        let mut tracker = AlertTracker::new();
        loop {
            if let Ok(payload) = crate::scan_dashboard() {
                let errors = payload
                    .cards
                    .into_iter()
                    .filter(|c| c.kind == CardKind::Error && c.status == CardStatus::New)
                    .map(|c| ErrorSeen {
                        fingerprint: c.fingerprint,
                        title: c.title,
                        project: c.project,
                    });
                if let Some(alert) = tracker.check(errors, Instant::now()) {
                    send(&app, &alert);
                }
            }
            std::thread::sleep(CHECK_EVERY);
        }
    });
}

fn send(app: &AppHandle, alert: &Alert) {
    let (enabled, spanish) = {
        let prefs = app.state::<Mutex<AlertPrefs>>();
        let prefs = prefs.lock().unwrap_or_else(|e| e.into_inner());
        (prefs.enabled && prefs.errors, prefs.spanish)
    };
    if enabled {
        let (title, body) = texts(alert, spanish);
        let _ = deliver(app, title, body);
    }
}

/// Idioma elegido en la interfaz para los avisos.
pub fn spanish(app: &AppHandle) -> bool {
    let prefs = app.state::<Mutex<AlertPrefs>>();
    prefs.lock().map(|p| p.spanish).unwrap_or(true)
}

pub fn deliver(app: &AppHandle, title: String, body: String) -> Result<(), String> {
    #[cfg(windows)]
    if tauri::is_dev() {
        return windows::send(app, &title, &body);
    }

    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| e.to_string())
}

fn texts(alert: &Alert, spanish: bool) -> (String, String) {
    match (alert, spanish) {
        (Alert::One { title, project }, true) => {
            (format!("Error nuevo en {project}"), title.clone())
        }
        (Alert::One { title, project }, false) => {
            (format!("New error in {project}"), title.clone())
        }
        (
            Alert::Many {
                count,
                latest_title,
            },
            true,
        ) => (
            format!("{count} errores nuevos"),
            format!("El más reciente: {latest_title}"),
        ),
        (
            Alert::Many {
                count,
                latest_title,
            },
            false,
        ) => (
            format!("{count} new errors"),
            format!("Latest: {latest_title}"),
        ),
    }
}
