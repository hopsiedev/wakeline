//! Selector nativo de carpetas de Windows.

use std::path::PathBuf;

use windows::Win32::System::Com::{
    CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx,
    CoTaskMemFree, CoUninitialize,
};
use windows::Win32::UI::Shell::{
    FOS_FORCEFILESYSTEM, FOS_PATHMUSTEXIST, FOS_PICKFOLDERS, FileOpenDialog, IFileOpenDialog,
    SIGDN_FILESYSPATH,
};

pub fn pick() -> Result<Option<PathBuf>, String> {
    unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok() }
        .map_err(|error| error.to_string())?;
    let result = unsafe { pick_inner() };
    unsafe { CoUninitialize() };
    result
}

unsafe fn pick_inner() -> Result<Option<PathBuf>, String> {
    let dialog: IFileOpenDialog = unsafe {
        CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER)
            .map_err(|error| error.to_string())?
    };
    unsafe {
        dialog
            .SetOptions(FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST)
            .map_err(|error| error.to_string())?;
        if let Err(error) = dialog.Show(None) {
            // HRESULT_FROM_WIN32(ERROR_CANCELLED)
            return if error.code().0 as u32 == 0x8007_04c7 {
                Ok(None)
            } else {
                Err(error.to_string())
            };
        }
        let item = dialog.GetResult().map_err(|error| error.to_string())?;
        let raw = item
            .GetDisplayName(SIGDN_FILESYSPATH)
            .map_err(|error| error.to_string())?;
        let path = raw.to_string().map_err(|error| error.to_string());
        CoTaskMemFree(Some(raw.0.cast()));
        path.map(|path| Some(PathBuf::from(path)))
    }
}
