use std::path::Path;

pub fn manual_updates_at(executable: &Path, linux_appimage: bool) -> bool {
    executable
        .parent()
        .is_some_and(|directory| directory.join("wakeline-portable.json").is_file())
        || (cfg!(target_os = "linux") && !linux_appimage)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn portable_package_never_runs_an_installer_even_with_an_appimage_environment() {
        let root = std::env::temp_dir().join(format!("wakeline-portable-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("wakeline-portable.json"), "{}").unwrap();
        assert!(manual_updates_at(&root.join("wakeline-app.exe"), true));
        std::fs::remove_file(root.join("wakeline-portable.json")).unwrap();
        std::fs::remove_dir(root).unwrap();
    }

    #[test]
    fn debian_package_uses_its_package_manager_instead_of_appimage_updates() {
        let path = Path::new("/usr/bin/wakeline-app");
        assert_eq!(manual_updates_at(path, false), cfg!(target_os = "linux"));
        assert!(!manual_updates_at(path, true));
    }
}
