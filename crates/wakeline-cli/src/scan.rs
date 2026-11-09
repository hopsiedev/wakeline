//! `wakeline scan`: revisa las sesiones de Claude Code de un proyecto de forma
//! incremental (guardando el offset por archivo en `state.json`) y muestra las tarjetas.

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime};

use anyhow::{Context, Result};
use wakeline_core::CardKind;
use wakeline_core::code::{CodeCard, CodeScanner};
use wakeline_core::docs;
use wakeline_core::sessions::{SessionCard, claude, scan_files_incremental};
use wakeline_core::store::{ExportItem, LocalState, format_todo_markdown};
use wakeline_core::watcher::DirWatcher;

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
    if let Ok(canonical) = std::fs::canonicalize(&options.project) {
        print_code_cards(&CodeScanner::new().scan_project(&canonical));
    }
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
    let code_cards = CodeScanner::new().scan_project(&canonical);
    let code_locations: Vec<String> = code_cards.iter().map(CodeCard::location).collect();

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

    for (c, location) in code_cards.iter().zip(&code_locations) {
        items.push(ExportItem {
            kind: c.kind,
            title: &c.title,
            origin: location,
            status: state.status_for(c.fingerprint.as_str()),
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

pub struct WatchOptions {
    pub extra_path: Option<PathBuf>,
    pub sessions_dir: Option<PathBuf>,
    pub debounce_ms: u64,
    pub once: bool,
}

pub fn watch(options: WatchOptions) -> Result<()> {
    watch_with_state_path(options, &LocalState::default_path())
}

pub fn watch_with_state_path(options: WatchOptions, state_path: &Path) -> Result<()> {
    let sessions_root = match options.sessions_dir {
        Some(dir) => dir,
        None => default_sessions_dir()?,
    };
    let mut state = LocalState::load(state_path);

    let mut watched_dirs: Vec<PathBuf> = state
        .watched_folders
        .iter()
        .map(PathBuf::from)
        .filter_map(|p| std::fs::canonicalize(&p).ok())
        .filter(|p| p.is_dir())
        .collect();

    if let Some(extra) = &options.extra_path {
        let canonical = std::fs::canonicalize(extra)
            .with_context(|| format!("no existe la carpeta {}", extra.display()))?;
        if !watched_dirs
            .iter()
            .any(|p| normalize(p) == normalize(&canonical))
        {
            watched_dirs.push(canonical);
        }
    }

    if watched_dirs.is_empty() {
        let current = std::fs::canonicalize(".")
            .context("no se pudo resolver la carpeta actual para vigilar")?;
        watched_dirs.push(current);
    }

    let normalized_projects: Vec<String> = watched_dirs.iter().map(|p| normalize(p)).collect();

    println!(
        "Wakeline vigilando {} carpeta(s). Pulsa Ctrl+C para salir.",
        watched_dirs.len()
    );
    for dir in &watched_dirs {
        println!("  - {}", dir.display());
    }

    let scan_once = |state: &mut LocalState| -> Result<usize> {
        let started = Instant::now();
        let cutoff = SystemTime::now() - Duration::from_secs(30 * 24 * 3600);
        let mut files = claude::discover(&sessions_root).unwrap_or_default();
        files.retain(|f| modified(&f.path).is_none_or(|m| m >= cutoff));

        let report = scan_files_incremental(&files, state)?;
        let _ = state.save(state_path);
        let read_time = started.elapsed();

        let mut cards: Vec<SessionCard> = report
            .cards
            .into_iter()
            .filter(|c| {
                c.cwd
                    .as_deref()
                    .is_some_and(|cwd| normalized_projects.iter().any(|proj| belongs_to(cwd, proj)))
            })
            .collect();

        let mut doc_count = 0usize;
        let mut code_cards: Vec<CodeCard> = Vec::new();
        let mut scanner = CodeScanner::new();
        for dir in &watched_dirs {
            if let Ok(doc_cards) = docs::scan_project_docs(dir) {
                doc_count += doc_cards.len();
            }
            code_cards.extend(scanner.scan_project(dir));
        }

        cards.sort_by(|a, b| b.last_seen.cmp(&a.last_seen));
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
        if doc_count > 0 {
            println!("Documentos: {doc_count} pendiente(s) en archivos Markdown\n");
        }
        print_code_cards(&code_cards);
        Ok(cards.len() + doc_count + code_cards.len())
    };

    scan_once(&mut state)?;

    let debounce = Duration::from_millis(options.debounce_ms.max(50));
    let (mut watcher, stopper) = DirWatcher::new(debounce, debounce * 10)
        .context("no se pudo iniciar el vigilante de archivos (notify)")?;
    let _ = ctrlc::set_handler(move || stopper.stop());

    for dir in &watched_dirs {
        watcher
            .watch(dir)
            .with_context(|| format!("no se pudo vigilar {}", dir.display()))?;
    }
    if sessions_root.is_dir()
        && !watched_dirs
            .iter()
            .any(|p| normalize(p) == normalize(&sessions_root))
    {
        let _ = watcher.watch(&sessions_root);
    }

    while let Some(batch) = watcher.next_batch() {
        if let Some(last_path) = batch.last() {
            println!(
                "Cambio detectado en {} — actualizando...",
                last_path.display()
            );
        }
        scan_once(&mut state)?;
        if options.once {
            return Ok(());
        }
    }
    println!("Vigilancia detenida.");
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

fn print_code_cards(cards: &[CodeCard]) {
    if cards.is_empty() {
        return;
    }
    println!("Código ({})", cards.len());
    for card in cards {
        let kind = match card.kind {
            CardKind::Idea => "idea ",
            _ => "tarea",
        };
        println!(
            "  ×{:<3} {kind}  {}  {}",
            card.occurrences,
            card.location(),
            card.title
        );
    }
    println!();
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

    #[test]
    fn watch_detects_file_change_and_updates_incremental_state() {
        let base = std::env::temp_dir().join(format!("wakeline-watch-{}", std::process::id()));
        let proj_dir = base.join("proj");
        let sessions_dir = base.join("sessions").join("proj-1");
        let state_path = base.join("state.json");
        std::fs::create_dir_all(&proj_dir).unwrap();
        std::fs::create_dir_all(&sessions_dir).unwrap();

        let canonical_proj = std::fs::canonicalize(&proj_dir).unwrap();
        let cwd_escaped = canonical_proj
            .to_string_lossy()
            .strip_prefix(r"\\?\")
            .unwrap_or(&canonical_proj.to_string_lossy())
            .replace('\\', "\\\\");

        let session_file = sessions_dir.join("s1.jsonl");
        let line1 = format!(
            r#"{{"type":"assistant","sessionId":"s1","cwd":"{cwd_escaped}","gitBranch":"main","timestamp":"2026-11-08T10:00:00Z","message":{{"stop_reason":"end_turn","content":[{{"type":"text","text":"Queda pendiente revisar el recibo."}}]}}}}"#
        );
        std::fs::write(&session_file, format!("{line1}\n")).unwrap();

        let state = LocalState {
            config_version: 1,
            watched_folders: vec![canonical_proj.to_string_lossy().into_owned()],
            ..Default::default()
        };
        state.save(&state_path).unwrap();

        let trigger_file = proj_dir.join("README.md");
        let trigger_clone = trigger_file.clone();
        let writer = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(250));
            std::fs::write(&trigger_clone, "# Cambio\n").unwrap();
        });

        watch_with_state_path(
            WatchOptions {
                extra_path: None,
                sessions_dir: Some(base.join("sessions")),
                debounce_ms: 100,
                once: true,
            },
            &state_path,
        )
        .unwrap();
        writer.join().unwrap();

        let saved = LocalState::load(&state_path);
        let _ = std::fs::remove_dir_all(&base);
        assert_eq!(saved.session_offsets.len(), 1);
        assert_eq!(saved.session_file_cards.len(), 1);
    }
}
