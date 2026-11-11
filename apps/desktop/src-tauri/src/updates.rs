//! Actualizaciones firmadas desde GitHub Releases (Q60).
//!
//! El actualizador de Tauri descarga `latest.json` del último release publicado,
//! comprueba la firma con la clave pública de `tauri.conf.json` y lanza el instalador.
//! En Windows la app se cierra sola al empezar la instalación.

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
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
/// Hourly: the app lives in the tray for days and a new version should not wait 6 h.
const CHECK_EVERY: std::time::Duration = std::time::Duration::from_secs(60 * 60);

/// Checks in the background, announces availability, and waits for user installation.
pub fn start(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(FIRST_CHECK_AFTER);
        loop {
            let _ = tauri::async_runtime::block_on(check_update(app.clone()));
            std::thread::sleep(CHECK_EVERY);
        }
    });
}

#[tauri::command]
pub async fn check_update(app: AppHandle) -> Result<UiUpdate, String> {
    let current_version = app.package_info().version.to_string();
    if manual_updates(&app) {
        // Portable/unsigned builds still check the real published release.
        let value =
            tauri::async_runtime::spawn_blocking(move || check_manual_release(current_version))
                .await
                .map_err(|error| error.to_string())??;
        announce(&app, &value);
        return Ok(value);
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
    // Without a newer release the user is up to date, signed build or not.
    let state = match (&update, signing_configured(&app)) {
        (None, _) => "up_to_date",
        (Some(_), false) => "unconfigured",
        (Some(_), true) => "available",
    };
    let value = UiUpdate {
        current_version,
        version: update.as_ref().map(|u| u.version.clone()),
        notes: update.and_then(|u| u.body),
        state,
    };
    announce(&app, &value);
    Ok(value)
}

/// Public release lookup must work without gh, authentication, or private-repo quota.
pub(crate) fn check_manual_release(current_version: String) -> Result<UiUpdate, String> {
    let _ = rustls::crypto::ring::default_provider().install_default();
    let response = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent(concat!("Wakeline/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())?
        .get("https://api.github.com/repos/hopsiedev/wakeline/releases/latest")
        .send()
        .map_err(|e| e.to_string())?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(UiUpdate {
            current_version,
            version: None,
            notes: None,
            state: "unpublished",
        });
    }
    let release: serde_json::Value = response
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .map_err(|e| e.to_string())?;
    let version = release["tag_name"]
        .as_str()
        .ok_or("INVALID_RELEASE")?
        .trim_start_matches('v');
    let available = semver::Version::parse(version).map_err(|e| e.to_string())?
        > semver::Version::parse(&current_version).map_err(|e| e.to_string())?;
    Ok(UiUpdate {
        current_version,
        version: available.then(|| version.to_string()),
        notes: release["body"].as_str().map(str::to_string),
        state: if available { "manual" } else { "up_to_date" },
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

fn announce(app: &AppHandle, value: &UiUpdate) {
    if !matches!(value.state, "available" | "manual") {
        return;
    }
    let _ = app.emit("wakeline://update-available", value);
    let prefs = app.state::<std::sync::Mutex<crate::alerts::AlertPrefs>>();
    if !prefs
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .enabled
    {
        return;
    }
    static TRACKER: std::sync::OnceLock<std::sync::Mutex<crate::update_notice::UpdateNotice>> =
        std::sync::OnceLock::new();
    let mut tracker = TRACKER
        .get_or_init(Default::default)
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    if !tracker.pending(value.state, value.version.as_deref()) {
        return;
    }
    let Some(version) = value.version.as_deref() else {
        return;
    };
    let notice_path = app
        .path()
        .app_data_dir()
        .ok()
        .map(|path| path.join("update-notified-version"));
    if notice_path
        .as_ref()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .as_deref()
        == Some(version)
    {
        tracker.delivered(version);
        return;
    }
    let (title, body) = if crate::alerts::spanish(app) {
        (
            format!("Wakeline {version} está disponible"),
            "Abre Wakeline y pulsa Actualizar ahora en el sidebar.".to_string(),
        )
    } else {
        (
            format!("Wakeline {version} is available"),
            "Open Wakeline and choose Update now in the sidebar.".to_string(),
        )
    };
    if crate::alerts::deliver(app, title, body).is_ok() {
        tracker.delivered(version);
        if let Some(path) = notice_path {
            if let Some(parent) = path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let _ = std::fs::write(path, version);
        }
    }
}
