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
}

#[tauri::command]
pub async fn check_update(app: AppHandle) -> Result<UiUpdate, String> {
    let current_version = app.package_info().version.to_string();
    let update = app
        .updater()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| error.to_string())?;
    Ok(UiUpdate {
        current_version,
        version: update.as_ref().map(|u| u.version.clone()),
        notes: update.and_then(|u| u.body),
    })
}

#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    let update = app
        .updater()
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
