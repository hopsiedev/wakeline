//! `wakeline scan`: revisa las sesiones de Claude Code de un proyecto de forma
//! incremental (guardando el offset por archivo en `state.json`) y muestra las tarjetas.

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime};

use anyhow::{Context, Result};
use wakeline_core::CardKind;
use wakeline_core::docs;
use wakeline_core::sessions::{SessionCard, claude, scan_files_incremental};
use wakeline_core::store::{ExportItem, LocalState, format_todo_markdown};

pub struct ScanOptions {
    pub project: PathBuf,
    pub sessions_dir: Option<PathBuf>,
    /// `None` = todo el historial.
    pub days: Option<u64>,
    pub all_projects: bool,
}

pub fn run(options: ScanOptions) -> Result<()> {
    let root = match options.sessions_dir {
        Some(dir) => dir,
        None => default_sessions_dir()?,
    };
    let project = normalize(
        &std::fs::canonicalize(&options.project)
            .with_context(|| format!("no existe la carpeta {}", options.project.display()))?,
    );

    let started = Instant::now();
    let cutoff = options
        .days
        .map(|d| SystemTime::now() - Duration::from_secs(d * 24 * 3600));

    let mut files =
        claude::discover(&root).with_context(|| format!("no se pudo leer {}", root.display()))?;
    if let Some(cutoff) = cutoff {
        files.retain(|f| modified(&f.path).is_none_or(|m| m >= cutoff));
    }

    let state_path = LocalState::default_path();
    let mut state = LocalState::load(&state_path);
    let report = scan_files_incremental(&files, &mut state)
        .with_context(|| format!("no se pudo escanear {}", root.display()))?;
    let _ = state.save(&state_path);
    let read_time = started.elapsed();

    let mut cards = report.cards;
    if !options.all_projects {
        cards.retain(|c| {
            c.cwd
                .as_deref()
                .is_some_and(|cwd| belongs_to(cwd, &project))
        });
    }
    let total_time = started.elapsed();

    print_report(
        &files.len(),
        report.bytes_read,
        report.bad_lines,
        report.events_read,
        read_time,
        total_time,
        &cards,
    );
    Ok(())
}

pub fn export(project_path: PathBuf) -> Result<()> {
    let canonical = std::fs::canonicalize(&project_path)
        .with_context(|| format!("no existe la carpeta {}", project_path.display()))?;
    let project = normalize(&canonical);
    let project_name = canonical
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "Proyecto".into());

    let root = default_sessions_dir()?;
    let cutoff = SystemTime::now() - Duration::from_secs(30 * 24 * 3600);
    let mut files = claude::discover(&root).unwrap_or_default();
    files.retain(|f| modified(&f.path).is_none_or(|m| m >= cutoff));

    let state_path = LocalState::default_path();
    let mut state = LocalState::load(&state_path);
    let report = scan_files_incremental(&files, &mut state).unwrap_or_default();
    let _ = state.save(&state_path);
    let session_cards: Vec<_> = report
        .cards
        .into_iter()
        .filter(|c| {
            c.cwd
                .as_deref()
                .is_some_and(|cwd| belongs_to(cwd, &project))
        })
        .collect();
    let doc_cards = docs::scan_project_docs(&canonical).unwrap_or_default();

    let mut items: Vec<ExportItem<'_>> = Vec::new();
    for c in &session_cards {
        items.push(ExportItem {
            kind: c.kind,
            title: &c.title,
            origin: "Sesión IA",
            status: state.status_for(c.fingerprint.as_str()),
        });
    }
    for d in &doc_cards {
        items.push(ExportItem {
            kind: d.kind,
            title: &d.title,
            origin: &d.location,
            status: state.status_for(d.fingerprint.as_str()),
        });
    }

    let md = format_todo_markdown(&project_name, &items);
    let out_path = canonical.join("docs").join("TODO.md");
    if let Some(parent) = out_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&out_path, md)?;
    println!("Exportadas tarjetas abiertas en {}", out_path.display());
    Ok(())
}

fn print_report(
    files: &usize,
    bytes: u64,
    bad_lines: usize,
    events: usize,
    read_time: Duration,
    total_time: Duration,
    cards: &[SessionCard],
) {
    let mb = bytes as f64 / 1_048_576.0;
    let speed = mb / read_time.as_secs_f64().max(0.001);
    println!("Sesiones: {files} archivos, {mb:.1} MB leídos en {read_time:.2?} ({speed:.0} MB/s)");
    println!("Eventos útiles: {events} · líneas inválidas: {bad_lines} · total: {total_time:.2?}");
    println!();

    for (kind, label) in [
        (CardKind::Error, "Errores"),
        (CardKind::Task, "Tareas"),
        (CardKind::Idea, "Ideas"),
    ] {
        let mut group: Vec<&SessionCard> = cards.iter().filter(|c| c.kind == kind).collect();
        group.sort_by(|a, b| b.last_seen.cmp(&a.last_seen));
        println!("{label} ({})", group.len());
        for card in group {
            let date = card
                .last_seen
                .as_deref()
                .map(|t| &t[..t.len().min(10)])
                .unwrap_or("");
            let branch = card.git_branch.as_deref().unwrap_or("-");
            println!(
                "  ×{:<3} {date}  [{branch}]  {}",
                card.occurrences, card.title
            );
        }
        println!();
    }
}

fn default_sessions_dir() -> Result<PathBuf> {
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .context("no se encontró la carpeta del usuario")?;
    Ok(PathBuf::from(home).join(".claude").join("projects"))
}

fn modified(path: &Path) -> Option<SystemTime> {
    std::fs::metadata(path).and_then(|m| m.modified()).ok()
}

/// Ruta comparable: sin el prefijo `\\?\` de Windows, con `/` y en minúsculas.
fn normalize(path: &Path) -> String {
    let s = path.to_string_lossy();
    let s = s.strip_prefix(r"\\?\").unwrap_or(&s);
    s.replace('\\', "/").trim_end_matches('/').to_lowercase()
}

fn belongs_to(cwd: &str, project: &str) -> bool {
    let cwd = normalize(Path::new(cwd));
    cwd == project || cwd.starts_with(&format!("{project}/"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_cwd_matches_project_and_subfolders() {
        let project = normalize(Path::new(r"\\?\C:\Users\U\contastack"));
        assert!(belongs_to(r"C:\Users\U\contastack", &project));
        assert!(belongs_to(r"c:\users\u\Contastack\app-expo", &project));
        assert!(!belongs_to(r"C:\Users\U\contastack-old", &project));
    }
}
