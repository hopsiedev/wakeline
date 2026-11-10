//! Comparación de rutas de proyectos vigilados.

pub fn normalized_path(path: &str) -> String {
    let windows_path =
        path.as_bytes().get(1) == Some(&b':') || path.starts_with("\\\\") || path.starts_with("//");
    if !windows_path {
        return path.trim_end_matches('/').to_string();
    }
    let slashes = path.replace('\\', "/");
    slashes
        .strip_prefix("//?/")
        .unwrap_or(&slashes)
        .trim_end_matches('/')
        .to_lowercase()
}

pub fn is_within(root: &str, candidate: &str) -> bool {
    let root = normalized_path(root);
    let candidate = normalized_path(candidate);
    candidate == root || candidate.starts_with(&format!("{root}/"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn posix_paths_keep_case_and_backslashes_inside_names() {
        assert!(!is_within("/home/user/Work", "/home/user/work/secrets"));
        assert!(is_within("/home/user/Work", "/home/user/Work/src"));
        assert_eq!(normalized_path("/home/user/a\\b/"), "/home/user/a\\b");
    }

    #[test]
    fn matches_only_selected_folder_and_descendants() {
        assert!(is_within(
            r"C:\Users\U\app-expo",
            r"c:/users/u/app-expo/src"
        ));
        assert!(is_within(r"C:\Users\U\app-expo", r"C:\Users\U\app-expo"));
        assert!(!is_within(
            r"C:\Users\U\app-expo",
            r"C:\Users\U\app-expo-old"
        ));
        assert!(!is_within(r"C:\Users\U\app-expo", r"C:\Users\U\wakeline"));
    }

    #[test]
    fn ignores_windows_extended_path_prefix() {
        assert!(is_within(
            r"\\?\C:\Users\U\project",
            r"C:\Users\U\project\src"
        ));
    }
}
