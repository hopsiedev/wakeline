//! Actualizaciones firmadas desde GitHub Releases (Q60).
//!
//! El actualizador de Tauri descarga `latest.json` del último release publicado,
//! comprueba la firma con la clave pública de `tauri.conf.json` y lanza el instalador.
//! En Windows la app se cierra sola al empezar la instalación.

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

#[derive(Debug, Clone, Serialize)]
pub struct UiUpdate {
    pub current_version: String,
    /// Versión nueva, si la hay.
    pub version: Option<String>,
    pub notes: Option<String>,
    pub state: &'static str,
}

fn signing_configured(app: &AppHandle) -> bool {
    app.config()
        .plugins
        .0
        .get("updater")
        .and_then(|config| config.get("pubkey"))
        .and_then(|value| value.as_str())
        .is_some_and(|key| !key.is_empty() && !key.starts_with("REEMPLAZAR"))
}

fn manual_updates(app: &AppHandle) -> bool {
    !signing_configured(app)
        || std::env::current_exe().is_ok_and(|executable| {
            crate::distribution::manual_updates_at(
                &executable,
                std::env::var_os("APPIMAGE").is_some(),
            )
        })
}

/// Primera revisión un minuto después de arrancar, para no frenar el inicio.
const FIRST_CHECK_AFTER: std::time::Duration = std::time::Duration::from_secs(60);
const CHECK_EVERY: std::time::Duration = std::time::Duration::from_secs(6 * 60 * 60);

/// Busca e instala versiones firmadas en segundo plano.
pub fn start(app: &AppHandle) {
    if manual_updates(app) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(FIRST_CHECK_AFTER);
        loop {
            if let Ok(UiUpdate {
                state: "available", ..
            }) = tauri::async_runtime::block_on(check_update(app.clone()))
                && let Err(error) = tauri::async_runtime::block_on(install_update(app.clone()))
            {
                let (title, body) = if crate::alerts::spanish(&app) {
                    (
                        "No se pudo actualizar Wakeline".to_string(),
                        format!("Vuelve a intentarlo en Configuración > Actualizaciones. {error}"),
                    )
                } else {
                    (
                        "Wakeline could not update".to_string(),
                        format!("Try again in Settings > Updates. {error}"),
                    )
                };
                let _ = crate::alerts::deliver(&app, title, body);
            }
            std::thread::sleep(CHECK_EVERY);
        }
    });
}

#[tauri::command]
pub async fn check_update(app: AppHandle) -> Result<UiUpdate, String> {
    let current_version = app.package_info().version.to_string();
    if manual_updates(&app) {
        return Ok(UiUpdate {
            current_version,
            version: None,
            notes: None,
            state: "manual",
        });
    }
    let result = app
        .updater_builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|error| error.to_string())?
        .check()
        .await;
    let update = match result {
        Ok(update) => update,
        Err(
            tauri_plugin_updater::Error::ReleaseNotFound
            | tauri_plugin_updater::Error::TargetNotFound(_)
            | tauri_plugin_updater::Error::TargetsNotFound(_),
        ) => {
            return Ok(UiUpdate {
                current_version,
                version: None,
                notes: None,
                state: "unpublished",
            });
        }
        Err(error) => return Err(error.to_string()),
    };
    let state = if !signing_configured(&app) {
        "unconfigured"
    } else if update.is_some() {
        "available"
    } else {
        "up_to_date"
    };
    Ok(UiUpdate {
        current_version,
        version: update.as_ref().map(|u| u.version.clone()),
        notes: update.and_then(|u| u.body),
        state,
    })
}

#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    static INSTALL_LOCK: std::sync::OnceLock<tauri::async_runtime::Mutex<()>> =
        std::sync::OnceLock::new();
    let _guard = INSTALL_LOCK
        .get_or_init(|| tauri::async_runtime::Mutex::new(()))
        .try_lock()
        .map_err(|_| "UPDATE_ALREADY_INSTALLING".to_string())?;
    if manual_updates(&app) {
        return Err("MANUAL_UPDATE_REQUIRED".into());
    }
    if !signing_configured(&app) {
        return Err("UPDATER_SIGNING_NOT_CONFIGURED".into());
    }
    let update = app
        .updater_builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| error.to_string())?
        .ok_or("no hay ninguna versión nueva")?;
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|error| error.to_string())?;
    app.restart()
}
