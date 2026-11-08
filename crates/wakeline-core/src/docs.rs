//! Lector de documentos del proyecto (`specs/**/*.md` y `docs/hoja-de-ruta.md`).
//!
//! Extrae las entradas de las secciones «Brechas conocidas», «Pendientes inmediatos»,
//! «Tareas del usuario» e «Ideas guardadas» con su `archivo:línea`.

use std::io;
use std::path::Path;

use serde::Serialize;

use crate::card::{CardKind, SourceKind};
use crate::exclusions::is_excluded;
use crate::fingerprint::Fingerprint;
use crate::redact::redact;

/// Una tarjeta encontrada en un documento Markdown del repositorio.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DocCard {
    pub fingerprint: Fingerprint,
    pub kind: CardKind,
    pub title: String,
    /// Ruta relativa con línea, por ejemplo `specs/caja.md:99`.
    pub location: String,
    /// Etiqueta de la sección («Brecha», «Siguiente», «Idea»).
    pub tag: String,
}

#[derive(Clone, Copy)]
enum SectionMode {
    Ignore,
    Gap,
    Task,
    Idea,
}

/// Busca brechas en `specs/*.md` y pendientes/ideas en `docs/hoja-de-ruta.md`.
pub fn scan_project_docs(project_root: &Path) -> io::Result<Vec<DocCard>> {
    let mut cards = Vec::new();

    let specs_dir = project_root.join("specs");
    if specs_dir.is_dir() {
        let mut entries: Vec<_> = std::fs::read_dir(&specs_dir)?
            .filter_map(|e| e.ok().map(|e| e.path()))
            .collect();
        entries.sort();
        for path in entries {
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            if path.is_file()
                && name.ends_with(".md")
                && name != "README.md"
                && !name.starts_with('_')
                && !is_excluded(&path)
                && let Ok(text) = std::fs::read_to_string(&path)
            {
                let rel = format!("specs/{name}");
                cards.extend(parse_markdown(&rel, &text));
            }
        }
    }

    let roadmap = project_root.join("docs").join("hoja-de-ruta.md");
    if roadmap.is_file()
        && !is_excluded(&roadmap)
        && let Ok(text) = std::fs::read_to_string(&roadmap)
    {
        cards.extend(parse_markdown("docs/hoja-de-ruta.md", &text));
    }

    Ok(cards)
}

pub fn parse_markdown(rel_path: &str, content: &str) -> Vec<DocCard> {
    let mut out = Vec::new();
    let mut mode = SectionMode::Ignore;

    for (idx, raw_line) in content.lines().enumerate() {
        let line_num = idx + 1;
        let line = raw_line.trim();
        if let Some(heading) = line.strip_prefix("## ") {
            let h = heading.trim().to_lowercase();
            mode = if h.contains("brechas conocidas") || h.contains("known gaps") {
                SectionMode::Gap
            } else if h.contains("pendientes inmediatos") || h.contains("tareas del usuario") {
                SectionMode::Task
            } else if h.contains("ideas guardadas") {
                SectionMode::Idea
            } else {
                SectionMode::Ignore
            };
            continue;
        }
        let (kind, tag) = match mode {
            SectionMode::Ignore => continue,
            SectionMode::Gap => (CardKind::Task, "Brecha"),
            SectionMode::Task => (CardKind::Task, "Siguiente"),
            SectionMode::Idea => (CardKind::Idea, "Idea"),
        };
        let Some(item) = extract_list_item(line) else {
            continue;
        };
        let lower = item.to_lowercase();
        if lower == "ninguna." || lower == "ninguna" || lower.starts_with("ninguna ") {
            continue;
        }
        let title = redact(&clean_item(item));
        if title.chars().count() < 8 {
            continue;
        }
        let location = format!("{rel_path}:{line_num}");
        let fingerprint = Fingerprint::new(kind, SourceKind::Document, Some(rel_path), &title);
        out.push(DocCard {
            fingerprint,
            kind,
            title,
            location,
            tag: tag.to_string(),
        });
    }

    out
}

fn extract_list_item(line: &str) -> Option<&str> {
    if let Some(rest) = line.strip_prefix("- ").or_else(|| line.strip_prefix("* ")) {
        let rest = rest
            .strip_prefix("[ ] ")
            .or_else(|| rest.strip_prefix("[x] "))
            .unwrap_or(rest);
        return Some(rest.trim());
    }
    let digits = line.chars().take_while(|c| c.is_ascii_digit()).count();
    if digits > 0 {
        let after = &line[digits..];
        if let Some(rest) = after
            .strip_prefix(". ")
            .or_else(|| after.strip_prefix(") "))
        {
            return Some(rest.trim());
        }
    }
    None
}

fn clean_item(item: &str) -> String {
    let s: String = item.chars().filter(|c| !matches!(c, '*' | '`')).collect();
    let s = s.split_whitespace().collect::<Vec<_>>().join(" ");
    if s.chars().count() > 180 {
        let cut: String = s.chars().take(179).collect();
        format!("{cut}…")
    } else {
        s
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_known_gaps_and_roadmap_sections() {
        let md = "\
# Caja
## Reglas
- R1. No entra.
## Brechas conocidas
1. **Gastos por fecha, no por hora:** el WhatsApp suma los gastos por día.
2. **Gastos en el panel:** lee los gastos del dispositivo.
## Ideas guardadas (sin fase)
- **Cantidades con decimales:** vender por kg o metro.
";
        let cards = parse_markdown("specs/caja.md", md);
        assert_eq!(cards.len(), 3);
        assert_eq!(cards[0].kind, CardKind::Task);
        assert_eq!(cards[0].location, "specs/caja.md:5");
        assert_eq!(cards[0].tag, "Brecha");
        assert_eq!(cards[2].kind, CardKind::Idea);
    }
}
