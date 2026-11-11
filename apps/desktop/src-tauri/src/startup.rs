//! Windows startup registration, owned by the installed executable.
use std::path::Path;
pub fn background<I, S>(args: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter().any(|arg| arg.as_ref() == "--background")
}
pub fn launch_command(executable: &Path) -> Result<String, String> {
    let path = executable.to_str().ok_or("Invalid executable path")?;
    if path.contains('"') {
        return Err("Invalid executable path".into());
    }
    Ok(format!("\"{path}\" --background"))
}

#[cfg(windows)]
mod registry {
    use windows::Win32::Foundation::ERROR_FILE_NOT_FOUND;
    use windows::Win32::System::Registry::{
        HKEY_CURRENT_USER, REG_SZ, RRF_RT_REG_SZ, RegDeleteKeyValueW, RegGetValueW, RegSetKeyValueW,
    };
    use windows::core::{PCWSTR, w};
    const KEY: PCWSTR = w!(r"Software\Microsoft\Windows\CurrentVersion\Run");
    pub fn read() -> Result<Option<String>, String> {
        // RegGetValueW reports bytes; reserve the Windows maximum registry value length.
        let mut value = vec![0u16; 32768];
        let mut bytes = (value.len() * 2) as u32;
        let result = unsafe {
            RegGetValueW(
                HKEY_CURRENT_USER,
                KEY,
                w!("Wakeline"),
                RRF_RT_REG_SZ,
                None,
                Some(value.as_mut_ptr().cast()),
                Some(&mut bytes),
            )
        };
        if result == ERROR_FILE_NOT_FOUND {
            return Ok(None);
        }
        result.ok().map_err(|e| e.to_string())?;
        let end = value.iter().position(|c| *c == 0).unwrap_or(value.len());
        String::from_utf16(&value[..end])
            .map(Some)
            .map_err(|e| e.to_string())
    }
    pub fn write(command: Option<&str>) -> Result<(), String> {
        let result = match command {
            Some(command) => {
                let value: Vec<u16> = command.encode_utf16().chain(Some(0)).collect();
                unsafe {
                    RegSetKeyValueW(
                        HKEY_CURRENT_USER,
                        KEY,
                        w!("Wakeline"),
                        REG_SZ.0,
                        Some(value.as_ptr().cast()),
                        (value.len() * 2) as u32,
                    )
                }
            }
            None => unsafe { RegDeleteKeyValueW(HKEY_CURRENT_USER, KEY, w!("Wakeline")) },
        };
        if command.is_none() && result == ERROR_FILE_NOT_FOUND {
            return Ok(());
        }
        result.ok().map_err(|e| e.to_string())
    }
}
pub fn enabled() -> Result<bool, String> {
    #[cfg(windows)]
    {
        let expected = launch_command(&std::env::current_exe().map_err(|e| e.to_string())?)?;
        Ok(registry::read()?.as_deref() == Some(expected.as_str()))
    }
    #[cfg(not(windows))]
    {
        Ok(false)
    }
}
pub fn set_enabled(enabled: bool) -> Result<bool, String> {
    #[cfg(windows)]
    {
        let command = launch_command(&std::env::current_exe().map_err(|e| e.to_string())?)?;
        registry::write(enabled.then_some(command.as_str()))?;
        let actual = self::enabled()?;
        if actual != enabled {
            return Err("Windows did not retain the startup setting".into());
        }
        Ok(actual)
    }
    #[cfg(not(windows))]
    {
        let _ = enabled;
        Err("Windows only".into())
    }
}
