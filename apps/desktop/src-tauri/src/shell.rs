//! Ventana principal e ícono en la bandeja de Windows.
//!
//! - La ventana se abre centrada con un tamaño a elegir (ver `WindowSize`).
//! - La ✕ la esconde en la bandeja; Wakeline sigue vigilando. Para cerrarla del todo
//!   está «Cerrar Wakeline» en la bandeja o «Salir» en el menú de la cuenta.

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindow, Wry};

pub const MAIN_WINDOW: &str = "main";

/// Tamaño con el que abre la ventana. Mientras se elige, se puede probar cada opción
/// con la variable de entorno `WAKELINE_WINDOW` (`a`, `b`, `c`, `d` o `e`).
#[derive(Debug, Clone, Copy, PartialEq)]
enum WindowSize {
    /// Medida fija en píxeles lógicos (respeta la escala de Windows).
    Fixed { width: f64, height: f64 },
    /// Parte del área de trabajo de la pantalla.
    Share { width: f64, height: f64 },
}

impl WindowSize {
    fn from_choice(choice: &str) -> Self {
        match choice.trim().to_ascii_lowercase().as_str() {
            "a" => Self::Fixed {
                width: 1280.0,
                height: 800.0,
            },
            "c" => Self::Share {
                width: 0.70,
                height: 0.78,
            },
            "d" => Self::Share {
                width: 0.75,
                height: 0.82,
            },
            "e" => Self::Share {
                width: 0.86,
                height: 0.88,
            },
            _ => Self::Fixed {
                width: 1440.0,
                height: 900.0,
            }, // "b", por defecto
        }
    }
}

/// Textos del menú de la bandeja; la interfaz los cambia al cambiar de idioma.
pub struct TrayLabels {
    open: MenuItem<Wry>,
    quit: MenuItem<Wry>,
}

impl TrayLabels {
    pub fn set(&self, open: &str, quit: &str) -> tauri::Result<()> {
        self.open.set_text(open)?;
        self.quit.set_text(quit)
    }
}

/// Ajusta la ventana a la pantalla donde se abre y la centra.
pub fn fit_to_screen(window: &WebviewWindow) {
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else { return };

    let area = monitor.work_area();
    let (area_w, area_h) = (f64::from(area.size.width), f64::from(area.size.height));
    let choice = std::env::var("WAKELINE_WINDOW").unwrap_or_default();
    let (width, height) = match WindowSize::from_choice(&choice) {
        WindowSize::Fixed { width, height } => {
            let scale = monitor.scale_factor();
            (width * scale, height * scale)
        }
        WindowSize::Share { width, height } => (area_w * width, area_h * height),
    };
    // Nunca más grande que la pantalla (deja un margen de 5 %).
    let width = width.min(area_w * 0.95) as u32;
    let height = height.min(area_h * 0.95) as u32;
    let x = area.position.x + ((area.size.width - width) / 2) as i32;
    let y = area.position.y + ((area.size.height - height) / 2) as i32;

    let _ = window.set_size(PhysicalSize::new(width, height));
    let _ = window.set_position(PhysicalPosition::new(x, y));
}

/// Trae la ventana al frente (desde la bandeja o al abrir).
pub fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Crea el ícono de la bandeja con «Abrir» y «Cerrar».
pub fn create_tray(app: &AppHandle) -> tauri::Result<TrayLabels> {
    let open = MenuItem::with_id(app, "open", "Abrir Wakeline", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Cerrar Wakeline", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;

    let mut tray = TrayIconBuilder::with_id("wakeline")
        .tooltip("Wakeline")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;

    Ok(TrayLabels { open, quit })
}
