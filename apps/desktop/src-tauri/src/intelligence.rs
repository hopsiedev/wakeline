//! Optional provider settings. Secrets live in the OS vault, never in state.json.
use wakeline_core::intelligence::{Config, validate};
use wakeline_core::store::LocalState;

#[tauri::command]
pub async fn get_intelligence() -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(load_intelligence)
        .await
        .map_err(|error| error.to_string())?
}

pub(crate) fn load_intelligence() -> Result<serde_json::Value, String> {
    let state = LocalState::load(&LocalState::default_path());
    let config = state
        .extra
        .get("intelligence")
        .cloned()
        .and_then(|value| serde_json::from_value::<Config>(value).ok())
        .unwrap_or_else(|| Config {
            mode: "off".into(),
            endpoint: "http://127.0.0.1:11434".into(),
            model: String::new(),
        });
    Ok(
        serde_json::json!({"config":config,"has_key":vault::exists(),"secure_storage":cfg!(windows)}),
    )
}

#[tauri::command(async)]
pub fn set_intelligence(
    config: Config,
    api_key: Option<String>,
    remove_key: bool,
) -> Result<(), String> {
    validate(&config)?;
    let _guard = crate::STATE_ACCESS
        .lock()
        .map_err(|_| "STATE_LOCK_FAILED")?;
    if remove_key {
        vault::remove()?;
    }
    if let Some(key) = api_key.filter(|key| !key.is_empty()) {
        vault::save(&key)?;
    }
    let path = LocalState::default_path();
    let mut state = LocalState::load(&path);
    state.extra.insert(
        "intelligence".into(),
        serde_json::to_value(config).map_err(|e| e.to_string())?,
    );
    state.save(&path).map_err(|e| e.to_string())
}

#[cfg(windows)]
mod vault {
    use windows_sys::Win32::Security::Credentials::*;
    fn target() -> Vec<u16> {
        "dev.wakeline.app/intelligence/api"
            .encode_utf16()
            .chain(Some(0))
            .collect()
    }
    pub fn exists() -> bool {
        let mut credential = std::ptr::null_mut();
        // The vault owns the returned allocation; inspect presence only.
        unsafe {
            if CredReadW(target().as_ptr(), CRED_TYPE_GENERIC, 0, &mut credential) == 0 {
                return false;
            }
            CredFree(credential.cast());
        }
        true
    }
    pub fn save(key: &str) -> Result<(), String> {
        if key.len() > 2560 {
            return Err("API_KEY_TOO_LONG".into());
        }
        let mut target = target();
        let mut bytes = key.as_bytes().to_vec();
        let credential = CREDENTIALW {
            Type: CRED_TYPE_GENERIC,
            TargetName: target.as_mut_ptr(),
            CredentialBlobSize: bytes.len() as u32,
            CredentialBlob: bytes.as_mut_ptr(),
            Persist: CRED_PERSIST_LOCAL_MACHINE,
            ..Default::default()
        };
        let ok = unsafe { CredWriteW(&credential, 0) };
        bytes.fill(0);
        if ok == 0 {
            Err("SECURE_STORAGE_FAILED".into())
        } else {
            Ok(())
        }
    }
    pub fn remove() -> Result<(), String> {
        if !exists() {
            return Ok(());
        }
        if unsafe { CredDeleteW(target().as_ptr(), CRED_TYPE_GENERIC, 0) } == 0 {
            Err("SECURE_STORAGE_FAILED".into())
        } else {
            Ok(())
        }
    }
}

#[cfg(not(windows))]
mod vault {
    pub fn exists() -> bool {
        false
    }
    pub fn save(_: &str) -> Result<(), String> {
        Err("SECURE_STORAGE_UNAVAILABLE".into())
    }
    pub fn remove() -> Result<(), String> {
        Ok(())
    }
}
