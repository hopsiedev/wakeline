//! Identidad propia para los avisos nativos cuando Wakeline corre con `tauri dev`.
//! El plugin de Tauri usa la identidad de PowerShell en `target/debug`; Windows
//! exige un acceso directo del menú Inicio con AppUserModelID para mostrar la app.

use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use tauri::AppHandle;
use tauri_winrt_notification::{IconCrop, Toast};
use windows::Win32::Foundation::{E_OUTOFMEMORY, PROPERTYKEY};
use windows::Win32::System::Com::StructuredStorage::{
    PROPVARIANT, PROPVARIANT_0, PROPVARIANT_0_0, PROPVARIANT_0_0_0,
};
use windows::Win32::System::Com::{
    CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx,
    CoTaskMemAlloc, CoUninitialize, IPersistFile,
};
use windows::Win32::System::Variant::VT_LPWSTR;
use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;
use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};
use windows::core::{GUID, Interface, PCWSTR, PWSTR};

use crate::shell;

const APP_ID: &str = "dev.wakeline.app.development";
const APP_ID_KEY: PROPERTYKEY = PROPERTYKEY {
    fmtid: GUID::from_u128(0x9f4c2855_9f79_4b39_a8d0_e1d42de1d5f3),
    pid: 5,
};
static SHORTCUT_READY: OnceLock<Result<(), String>> = OnceLock::new();

pub fn send(app: &AppHandle, title: &str, body: &str) -> Result<(), String> {
    let app = app.clone();
    let title = title.to_owned();
    let body = body.to_owned();
    std::thread::Builder::new()
        .name("wakeline-native-toast".into())
        .spawn(move || {
            SHORTCUT_READY.get_or_init(install_shortcut).clone()?;
            let icon = Path::new(env!("CARGO_MANIFEST_DIR")).join("icons/128x128.png");
            Toast::new(APP_ID)
                .title(&title)
                .text1(&body)
                .icon(&icon, IconCrop::Square, "Wakeline")
                .on_activated(move |_| {
                    shell::show_main(&app);
                    Ok(())
                })
                .show()
                .map_err(|error| error.to_string())
        })
        .map_err(|error| error.to_string())?
        .join()
        .map_err(|_| "Falló el hilo de notificaciones de Windows".to_string())?
}

fn install_shortcut() -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|error| error.to_string())?;
    let app_data = std::env::var_os("APPDATA")
        .ok_or_else(|| "No se encontró APPDATA para registrar Wakeline".to_string())?;
    let directory =
        PathBuf::from(app_data).join("Microsoft/Windows/Start Menu/Programs/Wakeline Development");
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let shortcut = directory.join("Wakeline.lnk");

    // Este hilo es nuevo y tiene su propio apartamento COM.
    unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok() }
        .map_err(|error| error.to_string())?;
    let result = unsafe { write_shortcut(&exe, &shortcut) }.map_err(|error| error.to_string());
    unsafe { CoUninitialize() };
    result
}

unsafe fn write_shortcut(exe: &Path, shortcut: &Path) -> windows::core::Result<()> {
    let exe_wide = wide(exe.as_os_str());
    let shortcut_wide = wide(shortcut.as_os_str());
    let app_id_wide = wide(OsStr::new(APP_ID));

    unsafe {
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
        link.SetPath(PCWSTR(exe_wide.as_ptr()))?;
        link.SetIconLocation(PCWSTR(exe_wide.as_ptr()), 0)?;

        let properties: IPropertyStore = link.cast()?;
        // PROPVARIANT::drop llama a PropVariantClear, que libera VT_LPWSTR con
        // CoTaskMemFree. La cadena debe tener exactamente ese mismo allocator.
        let app_id_ptr = CoTaskMemAlloc(app_id_wide.len() * size_of::<u16>()).cast::<u16>();
        if app_id_ptr.is_null() {
            return Err(windows::core::Error::from_hresult(E_OUTOFMEMORY));
        }
        std::ptr::copy_nonoverlapping(app_id_wide.as_ptr(), app_id_ptr, app_id_wide.len());
        let app_id_value = PROPVARIANT {
            Anonymous: PROPVARIANT_0 {
                Anonymous: std::mem::ManuallyDrop::new(PROPVARIANT_0_0 {
                    vt: VT_LPWSTR,
                    wReserved1: 0,
                    wReserved2: 0,
                    wReserved3: 0,
                    Anonymous: PROPVARIANT_0_0_0 {
                        pwszVal: PWSTR(app_id_ptr),
                    },
                }),
            },
        };
        properties.SetValue(&APP_ID_KEY, &app_id_value)?;
        properties.Commit()?;

        let file: IPersistFile = link.cast()?;
        file.Save(PCWSTR(shortcut_wide.as_ptr()), true)?;
    }
    Ok(())
}

fn wide(value: &OsStr) -> Vec<u16> {
    value.encode_wide().chain(std::iter::once(0)).collect()
}
