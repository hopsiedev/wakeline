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

#[tauri::command]
pub async fn check_update(app: AppHandle) -> Result<UiUpdate, String> {
    let current_version = app.package_info().version.to_string();
    let result = app
        .updater_builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|error| error.to_string())?
        .check()
        .await;
    let update = match result {
        Ok(update) => update,
        Err(tauri_plugin_updater::Error::ReleaseNotFound) => {
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
