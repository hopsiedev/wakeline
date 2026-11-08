//! Rutas que Wakeline nunca lee. Esta lista no se puede desactivar.

use std::path::Path;

pub fn is_excluded(path: &Path) -> bool {
    let normalized = path.to_string_lossy().replace('\\', "/").to_lowercase();

    // Tokens de proceso de Claude Code.
    if normalized.contains("/.claude/sessions/") || normalized.ends_with("/.claude/sessions") {
        return true;
    }
    // Archivos .env y variantes (.env.local, .env.production...).
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    if file_name == ".env" || file_name.starts_with(".env.") {
        return true;
    }
    // Base de datos de OpenCode: guarda credenciales en tablas internas.
    file_name == "opencode.db"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secrets_are_always_excluded() {
        assert!(is_excluded(Path::new(
            r"C:\Users\U\.claude\sessions\abc.json"
        )));
        assert!(is_excluded(Path::new("/home/u/proj/.env")));
        assert!(is_excluded(Path::new("/home/u/proj/.env.production")));
        assert!(is_excluded(Path::new(
            "/home/u/.local/share/opencode/opencode.db"
        )));
    }

    #[test]
    fn normal_files_are_allowed() {
        assert!(!is_excluded(Path::new(
            r"C:\Users\U\.claude\projects\C--proj\s1.jsonl"
        )));
        assert!(!is_excluded(Path::new("/home/u/proj/.envrc.example.md")));
        assert!(!is_excluded(Path::new("/home/u/proj/src/environment.ts")));
    }
}
