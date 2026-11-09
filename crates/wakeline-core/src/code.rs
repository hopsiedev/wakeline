//! Fuente «Código»: comentarios `TODO` y `FIXME` en Rust, TypeScript, JavaScript y
//! Python, leídos con tree-sitter para no confundirlos con texto dentro de cadenas.
//!
//! El recorrido respeta `.gitignore`, la lista fija de carpetas de build y las
//! exclusiones de seguridad, que van siempre por encima (Q51).

use std::collections::HashMap;
use std::path::Path;

use serde::Serialize;
use tree_sitter::{Language, Node, Parser};

use crate::card::{CardKind, SourceKind};
use crate::exclusions::is_excluded;
use crate::fingerprint::Fingerprint;
use crate::redact::redact;

/// Archivos más grandes se saltan: suelen ser generados o minificados.
pub const MAX_FILE_BYTES: u64 = 1024 * 1024;

/// Carpetas que nunca se recorren, aunque no estén en `.gitignore`.
const IGNORED_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    ".next",
    "coverage",
    "__pycache__",
    ".venv",
];

/// Prefijos que convierten un `TODO` en Idea (Q41). Se comparan en minúsculas.
const IDEA_PREFIXES: &[&str] = &[
    "idea",
    "quizá",
    "quizás",
    "quiza",
    "quizas",
    "podríamos",
    "podriamos",
    "maybe",
    "consider",
];

/// Una tarjeta encontrada en un comentario del código.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CodeCard {
    pub fingerprint: Fingerprint,
    pub kind: CardKind,
    pub title: String,
    /// Ruta relativa al proyecto con `/`, por ejemplo `src/main.rs`.
    pub path: String,
    /// Línea (desde 1) de la primera aparición.
    pub line: usize,
    /// Comentarios iguales que hay ahora en el archivo (Q42).
    pub occurrences: u32,
}

impl CodeCard {
    /// `archivo:línea` de la primera aparición.
    pub fn location(&self) -> String {
        format!("{}:{}", self.path, self.line)
    }
}

/// `true` si el nombre es una carpeta de dependencias o de build que no se vigila.
pub fn is_ignored_dir(name: &str) -> bool {
    IGNORED_DIRS.contains(&name)
}

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
enum Lang {
    Rust,
    TypeScript,
    Tsx,
    JavaScript,
    Python,
}

impl Lang {
    fn from_path(path: &Path) -> Option<Self> {
        let ext = path.extension()?.to_string_lossy().to_lowercase();
        match ext.as_str() {
            "rs" => Some(Self::Rust),
            "ts" | "mts" | "cts" => Some(Self::TypeScript),
            "tsx" => Some(Self::Tsx),
            "js" | "jsx" | "mjs" | "cjs" => Some(Self::JavaScript),
            "py" => Some(Self::Python),
            _ => None,
        }
    }

    fn language(self) -> Language {
        match self {
            Self::Rust => tree_sitter_rust::LANGUAGE.into(),
            Self::TypeScript => tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
            Self::Tsx => tree_sitter_typescript::LANGUAGE_TSX.into(),
            Self::JavaScript => tree_sitter_javascript::LANGUAGE.into(),
            Self::Python => tree_sitter_python::LANGUAGE.into(),
        }
    }
}

/// `true` si el archivo es de un lenguaje que se analiza.
pub fn is_code_file(path: &Path) -> bool {
    Lang::from_path(path).is_some()
}

/// Reutiliza un parser por lenguaje durante un escaneo.
#[derive(Default)]
pub struct CodeScanner {
    parsers: HashMap<Lang, Parser>,
    /// Archivos de código que no se pudieron leer en el último recorrido.
    read_errors: usize,
}

impl CodeScanner {
    pub fn new() -> Self {
        Self::default()
    }

    /// Recorre el proyecto entero y devuelve sus tarjetas de código.
    pub fn scan_project(&mut self, root: &Path) -> Vec<CodeCard> {
        self.read_errors = 0;
        let walker = ignore::WalkBuilder::new(root)
            .require_git(false)
            .filter_entry(|entry| {
                let name = entry.file_name().to_string_lossy();
                let is_dir = entry.file_type().is_some_and(|t| t.is_dir());
                let skip_dir = is_dir && is_ignored_dir(&name);
                !skip_dir && !is_excluded(entry.path())
            })
            .build();

        let mut cards = Vec::new();
        for entry in walker.flatten() {
            if entry.file_type().is_some_and(|t| t.is_file()) {
                cards.extend(self.scan_file(root, entry.path()));
            }
        }
        cards
    }

    /// Analiza un solo archivo. Devuelve vacío si no se puede o no se debe leer.
    pub fn scan_file(&mut self, root: &Path, path: &Path) -> Vec<CodeCard> {
        let Some(lang) = Lang::from_path(path) else {
            return Vec::new();
        };
        if is_excluded(path) || std::fs::metadata(path).map_or(true, |m| m.len() > MAX_FILE_BYTES) {
            return Vec::new();
        }
        let Ok(bytes) = std::fs::read(path) else {
            self.read_errors += 1;
            return Vec::new();
        };
        if bytes.contains(&0) {
            return Vec::new();
        }
        let Ok(source) = String::from_utf8(bytes) else {
            return Vec::new();
        };
        let rel = relative_path(root, path);
        self.scan_source(lang, &rel, &source)
    }

    /// `true` si el último [`scan_project`](Self::scan_project) leyó todos los archivos.
    /// Un recorrido incompleto no puede cerrar tarjetas (Q54).
    pub fn last_scan_complete(&self) -> bool {
        self.read_errors == 0
    }

    fn scan_source(&mut self, lang: Lang, rel_path: &str, source: &str) -> Vec<CodeCard> {
        let parser = self.parsers.entry(lang).or_insert_with(|| {
            let mut parser = Parser::new();
            parser
                .set_language(&lang.language())
                .expect("gramática compatible con tree-sitter");
            parser
        });
        let Some(tree) = parser.parse(source, None) else {
            return Vec::new();
        };

        let mut found = Vec::new();
        collect_comments(tree.root_node(), source, &mut found);
        group_findings(rel_path, found)
    }
}

/// Un `TODO`/`FIXME` suelto antes de agrupar por huella.
struct Finding {
    kind: CardKind,
    title: String,
    line: usize,
}

fn collect_comments(node: Node<'_>, source: &str, out: &mut Vec<Finding>) {
    if node.kind().ends_with("comment") {
        if let Ok(text) = node.utf8_text(source.as_bytes()) {
            let first_line = node.start_position().row + 1;
            for (offset, line) in text.lines().enumerate() {
                if let Some(finding) = parse_comment_line(line, first_line + offset) {
                    out.push(finding);
                }
            }
        }
        return;
    }
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        collect_comments(child, source, out);
    }
}

/// Lee una línea de comentario: `// TODO: probar X` → Tarea «probar X».
fn parse_comment_line(line: &str, line_number: usize) -> Option<Finding> {
    let body = strip_comment_markers(line);
    let rest = body
        .strip_prefix("TODO")
        .or_else(|| body.strip_prefix("FIXME"))?;
    // `TODO(ana): x`, `TODO: x`, `TODO x` y `TODO` solo valen; `TODOS` no.
    let rest = match rest.chars().next() {
        None => rest,
        Some('(') => rest.split_once(')').map_or("", |(_, after)| after),
        Some(c) if c == ':' || c.is_whitespace() => rest,
        Some(_) => return None,
    };
    let text = rest
        .trim_start_matches(|c: char| c == ':' || c == '-' || c.is_whitespace())
        .trim_end()
        .trim_end_matches("*/")
        .trim_end();
    let tag = if body.starts_with("TODO") {
        "TODO"
    } else {
        "FIXME"
    };
    let title = if text.is_empty() {
        tag.to_string()
    } else {
        redact(text)
    };
    let lower = text.to_lowercase();
    let kind = if IDEA_PREFIXES.iter().any(|p| lower.starts_with(p)) {
        CardKind::Idea
    } else {
        CardKind::Task
    };
    Some(Finding {
        kind,
        title,
        line: line_number,
    })
}

fn strip_comment_markers(line: &str) -> &str {
    let mut s = line.trim_start();
    for marker in ["//!", "///", "//", "/**", "/*", "#", "*"] {
        if let Some(rest) = s.strip_prefix(marker) {
            s = rest;
            break;
        }
    }
    s.trim_start()
}

/// Junta las apariciones con la misma huella: el contador es cuántas hay ahora (Q42).
fn group_findings(rel_path: &str, findings: Vec<Finding>) -> Vec<CodeCard> {
    let mut cards: Vec<CodeCard> = Vec::new();
    for finding in findings {
        let fingerprint = Fingerprint::new(
            finding.kind,
            SourceKind::Comment,
            Some(rel_path),
            &finding.title,
        );
        if let Some(card) = cards.iter_mut().find(|c| c.fingerprint == fingerprint) {
            card.occurrences += 1;
            continue;
        }
        cards.push(CodeCard {
            fingerprint,
            kind: finding.kind,
            title: finding.title,
            path: rel_path.to_string(),
            line: finding.line,
            occurrences: 1,
        });
    }
    cards
}

fn relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn temp_project(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "wakeline-code-{name}-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn scan(lang: Lang, source: &str) -> Vec<CodeCard> {
        CodeScanner::new().scan_source(lang, "src/x", source)
    }

    #[test]
    fn todo_comment_becomes_task_with_file_and_line() {
        let dir = temp_project("basic");
        std::fs::create_dir_all(dir.join("src")).unwrap();
        std::fs::write(
            dir.join("src").join("main.rs"),
            "fn main() {}\n\n// TODO: probar X\n",
        )
        .unwrap();

        let cards = CodeScanner::new().scan_project(&dir);
        assert_eq!(cards.len(), 1);
        assert_eq!(cards[0].kind, CardKind::Task);
        assert_eq!(cards[0].title, "probar X");
        assert_eq!(cards[0].location(), "src/main.rs:3");
        assert_eq!(cards[0].occurrences, 1);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn rescanning_does_not_duplicate_or_inflate_the_counter() {
        let dir = temp_project("rescan");
        std::fs::write(
            dir.join("app.ts"),
            "// TODO: probar X\nconst a = 1;\n// TODO: probar X\n",
        )
        .unwrap();

        let mut scanner = CodeScanner::new();
        let first = scanner.scan_project(&dir);
        let second = scanner.scan_project(&dir);
        assert_eq!(first, second);
        assert_eq!(first.len(), 1);
        assert_eq!(first[0].occurrences, 2);
        assert_eq!(first[0].line, 1);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn moving_the_comment_keeps_the_fingerprint() {
        let before = scan(Lang::Rust, "// TODO: probar X\n");
        let after = scan(Lang::Rust, "\n\n\nfn a() {}\n// TODO: probar X\n");
        assert_eq!(before[0].fingerprint, after[0].fingerprint);
        assert_eq!(after[0].line, 5);
    }

    #[test]
    fn todo_inside_a_string_is_not_a_card() {
        assert!(scan(Lang::JavaScript, "const s = \"// TODO: no\";\n").is_empty());
        assert!(scan(Lang::Python, "s = '# TODO: no'\n").is_empty());
    }

    #[test]
    fn reads_every_supported_language() {
        assert_eq!(scan(Lang::Rust, "/* FIXME: a */\nfn a() {}")[0].title, "a");
        assert_eq!(scan(Lang::TypeScript, "let a = 1; // TODO b")[0].title, "b");
        assert_eq!(
            scan(Lang::Tsx, "const A = () => <div>{/* TODO: c */}</div>;")[0].title,
            "c"
        );
        assert_eq!(scan(Lang::JavaScript, "// TODO(ana): d")[0].title, "d");
        assert_eq!(scan(Lang::Python, "# FIXME: e\nx = 1")[0].title, "e");
    }

    #[test]
    fn block_comment_lines_keep_their_own_line_number() {
        let cards = scan(Lang::Rust, "/*\n * nada\n * TODO: segunda\n */\n");
        assert_eq!(cards[0].title, "segunda");
        assert_eq!(cards[0].line, 3);
    }

    #[test]
    fn idea_prefixes_make_an_idea_and_other_tags_are_ignored() {
        assert_eq!(
            scan(Lang::Rust, "// TODO: podríamos cachear")[0].kind,
            CardKind::Idea
        );
        assert_eq!(
            scan(Lang::Rust, "// TODO: maybe cache")[0].kind,
            CardKind::Idea
        );
        assert_eq!(scan(Lang::Rust, "// FIXME: roto")[0].kind, CardKind::Task);
        assert!(scan(Lang::Rust, "// HACK: x\n// XXX: y\n// TODOS los casos").is_empty());
    }

    #[test]
    fn skips_ignored_dirs_gitignore_secrets_and_big_files() {
        let dir = temp_project("skip");
        for sub in ["node_modules", "target", "generado"] {
            std::fs::create_dir_all(dir.join(sub)).unwrap();
            std::fs::write(dir.join(sub).join("a.js"), "// TODO: no\n").unwrap();
        }
        std::fs::write(dir.join(".gitignore"), "generado/\n").unwrap();
        std::fs::write(dir.join(".env.py"), "# TODO: secreto\n").unwrap();
        let big = format!("// TODO: grande\n{}", "x".repeat(MAX_FILE_BYTES as usize));
        std::fs::write(dir.join("big.js"), big).unwrap();
        std::fs::write(dir.join("ok.js"), "// TODO: sí\n").unwrap();

        let cards = CodeScanner::new().scan_project(&dir);
        let titles: Vec<_> = cards.iter().map(|c| c.title.as_str()).collect();
        assert_eq!(titles, vec!["sí"]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn unsupported_files_are_not_read() {
        assert!(!is_code_file(Path::new("README.md")));
        assert!(is_code_file(Path::new("a/b.tsx")));
    }
}
