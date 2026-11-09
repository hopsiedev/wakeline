//! Backend de la aplicación de escritorio Wakeline (Tauri v2).
//!
//! Expone comandos para leer las tarjetas reales desde `wakeline-core` (sesiones de
//! Claude Code y documentos `specs/`), cambiar su estado en `%APPDATA%\wakeline` y
//! exportar `docs/TODO.md` a pedido.

mod alerts;
#[cfg(windows)]
mod folder_picker;
mod shell;

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime};

use serde::{Deserialize, Serialize};
use tauri::Manager;
use wakeline_core::docs;
use wakeline_core::exclusions;
use wakeline_core::redact::redact;
use wakeline_core::sessions::{claude, scan_files_incremental};
use wakeline_core::store::{ExportItem, LocalState, ManualCard, format_todo_markdown};
use wakeline_core::watch::{is_within, normalized_path};
use wakeline_core::{CardKind, CardStatus, Fingerprint, SourceKind};

#[derive(Debug, Clone, Serialize)]
pub struct UiCard {
    pub fingerprint: String,
    pub short_id: String,
    pub kind: CardKind,
    pub status: CardStatus,
    pub title: String,
    pub project: String,
    pub branch: String,
    pub source_kind: SourceKind,
    pub source_label: String,
    pub location: String,
    pub code_excerpt: Option<String>,
    pub evidence: Option<String>,
    pub session_id: Option<String>,
    pub occurrences: u32,
    pub first_seen: String,
    pub last_seen: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct UiProjectSummary {
    pub name: String,
    pub path: String,
    pub branch: String,
    pub active: bool,
    pub errors: usize,
    pub tasks: usize,
    pub ideas: usize,
    pub done: usize,
    pub dismissed: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct UiFileEntry {
    pub name: String,
    pub relative_path: String,
    pub is_dir: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct UiSpecGap {
    pub title: String,
    pub location: String,
    pub tag: String,
    pub kind: CardKind,
}

#[derive(Debug, Clone, Serialize)]
pub struct DashboardPayload {
    pub cards: Vec<UiCard>,
    pub projects: Vec<UiProjectSummary>,
    pub spec_gaps: Vec<UiSpecGap>,
    pub session_files: usize,
    pub megabytes_read: f64,
    pub scan_ms: u64,
}

#[derive(Debug, Deserialize)]
pub struct StatusInput {
    pub fingerprint: String,
    pub status: CardStatus,
}

#[derive(Debug, Deserialize)]
pub struct CreateCardInput {
    pub title: String,
    pub kind: CardKind,
    pub project: String,
}

#[tauri::command]
async fn get_dashboard_data() -> Result<DashboardPayload, String> {
    tauri::async_runtime::spawn_blocking(scan_dashboard)
        .await
        .map_err(|error| error.to_string())?
}

fn scan_dashboard() -> Result<DashboardPayload, String> {
    let started = Instant::now();
    let state_path = LocalState::default_path();
    let mut state = LocalState::load(&state_path);
    let watched = watched_projects(&state.watched_folders);

    if watched.is_empty() {
        return Ok(DashboardPayload {
            cards: Vec::new(),
            projects: Vec::new(),
            spec_gaps: Vec::new(),
            session_files: 0,
            megabytes_read: 0.0,
            scan_ms: started.elapsed().as_millis() as u64,
        });
    }

    let home = user_home();
    let sessions_root = home.join(".claude").join("projects");
    let cutoff = SystemTime::now() - Duration::from_secs(30 * 24 * 3600);

    let mut files = claude::discover(&sessions_root).unwrap_or_default();
    files.retain(|f| {
        std::fs::metadata(&f.path)
            .and_then(|m| m.modified())
            .ok()
            .is_none_or(|m| m >= cutoff)
    });

    let report = scan_files_incremental(&files, &mut state).unwrap_or_default();
    let _ = state.save(&state_path);
    let bytes = report.bytes_read;
    let session_cards = report.cards;
    let mut cards: Vec<UiCard> = Vec::new();

    for (idx, sc) in session_cards.into_iter().enumerate() {
        let Some(watched_project) = watched_for_cwd(&watched, sc.cwd.as_deref()) else {
            continue;
        };
        let project = watched_project.name.clone();
        let fp_str = sc.fingerprint.as_str().to_string();
        let status = state.status_for(&fp_str);
        let branch = sc.git_branch.unwrap_or_else(|| "—".into());
        let last_seen = sc
            .last_seen
            .as_deref()
            .map(short_date)
            .unwrap_or_else(today_date);
        let first_seen = sc
            .first_seen
            .as_deref()
            .map(short_date)
            .unwrap_or_else(|| last_seen.clone());
        let short_id = format!("W-{:03}", idx + 1);
        let session_location = sc
            .session_id
            .get(..7)
            .map(|id| format!("sesión {id} · {branch}"))
            .unwrap_or_else(|| format!("sesión · {branch}"));
        let source_file = extract_file_target(&watched_project.path, &sc.title).or_else(|| {
            sc.evidence
                .as_deref()
                .and_then(|evidence| extract_file_target(&watched_project.path, evidence))
        });
        let code_excerpt = source_file
            .as_ref()
            .and_then(|(path, line)| read_code_excerpt(path, *line));
        let location = source_file
            .as_ref()
            .map(|(path, line)| {
                let relative = path.strip_prefix(&watched_project.path).unwrap_or(path);
                match line {
                    Some(line) => format!("{}:{line}", relative.display()),
                    None => relative.display().to_string(),
                }
            })
            .unwrap_or(session_location);

        cards.push(UiCard {
            fingerprint: fp_str,
            short_id,
            kind: sc.kind,
            status,
            title: sc.title,
            project,
            branch,
            source_kind: SourceKind::Session,
            source_label: "Sesión IA".into(),
            location,
            code_excerpt,
            evidence: sc.evidence,
            session_id: (!sc.session_id.is_empty()).then_some(sc.session_id),
            occurrences: sc.occurrences,
            first_seen,
            last_seen,
        });
    }

    let mut spec_gaps = Vec::new();

    for watched_project in &watched {
        let doc_cards = docs::scan_project_docs(&watched_project.path).unwrap_or_default();
        for dc in doc_cards {
            let source_file = extract_file_target(&watched_project.path, &dc.location);
            let code_excerpt = source_file
                .as_ref()
                .and_then(|(path, line)| read_code_excerpt(path, *line));
            spec_gaps.push(UiSpecGap {
                title: dc.title.clone(),
                location: dc.location.clone(),
                tag: dc.tag.clone(),
                kind: dc.kind,
            });
            let source_identity = format!("{}:{}", watched_project.path.display(), dc.location);
            let fp_str = Fingerprint::new(
                dc.kind,
                SourceKind::Document,
                Some(&source_identity),
                &dc.title,
            )
            .as_str()
            .to_string();
            let status = state.status_for(&fp_str);
            let short_id = format!("W-{:03}", cards.len() + 1);
            cards.push(UiCard {
                fingerprint: fp_str,
                short_id,
                kind: dc.kind,
                status,
                title: dc.title,
                project: watched_project.name.clone(),
                branch: read_git_branch(&watched_project.path, "—"),
                source_kind: SourceKind::Document,
                source_label: if dc.location.starts_with("specs/") {
                    "specs/".into()
                } else {
                    "Hoja de ruta".into()
                },
                location: dc.location,
                code_excerpt,
                evidence: None,
                session_id: None,
                occurrences: 1,
                first_seen: today_date(),
                last_seen: today_date(),
            });
        }
    }

    for mc in state
        .manual_cards
        .iter()
        .filter(|mc| watched.iter().any(|w| w.name == mc.project))
    {
        let status = state.status_for(&mc.fingerprint);
        let short_id = format!("W-{:03}", cards.len() + 1);
        cards.push(UiCard {
            fingerprint: mc.fingerprint.clone(),
            short_id,
            kind: mc.kind,
            status,
            title: mc.title.clone(),
            project: mc.project.clone(),
            branch: mc.branch.clone().unwrap_or_else(|| "—".into()),
            source_kind: SourceKind::Comment,
            source_label: "Manual".into(),
            location: "creada en Wakeline".into(),
            code_excerpt: None,
            evidence: None,
            session_id: None,
            occurrences: 1,
            first_seen: mc.created_at.clone(),
            last_seen: mc.created_at.clone(),
        });
    }

    cards.sort_by(|a, b| {
        kind_rank(a.kind)
            .cmp(&kind_rank(b.kind))
            .then_with(|| b.last_seen.cmp(&a.last_seen))
            .then_with(|| b.occurrences.cmp(&a.occurrences))
    });

    let projects = build_project_summaries(&watched, &cards);
    let megabytes_read = bytes as f64 / 1_048_576.0;
    let scan_ms = started.elapsed().as_millis() as u64;

    Ok(DashboardPayload {
        cards,
        projects,
        spec_gaps,
        session_files: files.len(),
        megabytes_read,
        scan_ms,
    })
}

#[tauri::command]
fn set_card_status(input: StatusInput) -> Result<(), String> {
    let path = LocalState::default_path();
    let mut state = LocalState::load(&path);
    state.set_status(input.fingerprint, input.status);
    state.save(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_card(input: CreateCardInput) -> Result<String, String> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err("El título no puede estar vacío".into());
    }
    let project_dir = project_base_dir(&input.project)?;
    let branch = read_git_branch(&project_dir, "—");
    let path = LocalState::default_path();
    let mut state = LocalState::load(&path);
    let fp = Fingerprint::new(input.kind, SourceKind::Comment, Some(&input.project), title);
    let fp_str = fp.as_str().to_string();
    state.manual_cards.push(ManualCard {
        fingerprint: fp_str.clone(),
        kind: input.kind,
        title: title.to_string(),
        project: input.project,
        branch: Some(branch),
        created_at: today_date(),
    });
    state.save(&path).map_err(|e| e.to_string())?;
    Ok(fp_str)
}

#[tauri::command]
async fn export_todo(project_name: Option<String>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || export_todo_impl(project_name))
        .await
        .map_err(|error| error.to_string())?
}

fn export_todo_impl(project_name: Option<String>) -> Result<String, String> {
    let payload = scan_dashboard()?;
    let state = LocalState::load(&LocalState::default_path());
    let watched = watched_projects(&state.watched_folders);
    let target_project = project_name
        .or_else(|| watched.first().map(|project| project.name.clone()))
        .ok_or_else(|| "Primero elige una carpeta para vigilar".to_string())?;
    let items: Vec<ExportItem<'_>> = payload
        .cards
        .iter()
        .filter(|c| c.project.eq_ignore_ascii_case(&target_project))
        .map(|c| ExportItem {
            kind: c.kind,
            title: &c.title,
            origin: &c.source_label,
            status: c.status,
        })
        .collect();

    let md = format_todo_markdown(&target_project, &items);
    let base_dir = project_base_dir(&target_project)?;
    let out_path = base_dir.join("docs").join("TODO.md");
    if let Some(parent) = out_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&out_path, md).map_err(|e| e.to_string())?;
    Ok(out_path.display().to_string())
}

fn kind_rank(kind: CardKind) -> u8 {
    match kind {
        CardKind::Error => 0,
        CardKind::Task => 1,
        CardKind::Idea => 2,
    }
}

fn user_home() -> PathBuf {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

#[derive(Debug, Clone)]
struct WatchedProject {
    name: String,
    path: PathBuf,
}

fn watched_projects(paths: &[String]) -> Vec<WatchedProject> {
    paths
        .iter()
        .map(|raw| {
            let path = PathBuf::from(raw);
            let name = path
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_else(|| raw.clone());
            WatchedProject { name, path }
        })
        .collect()
}

fn watched_for_cwd<'a>(
    watched: &'a [WatchedProject],
    cwd: Option<&str>,
) -> Option<&'a WatchedProject> {
    let cwd = cwd?;
    watched
        .iter()
        .filter(|project| is_within(&project.path.to_string_lossy(), cwd))
        .max_by_key(|project| project.path.as_os_str().len())
}

fn short_date(ts: &str) -> String {
    ts.get(..10).unwrap_or(ts).to_string()
}

fn today_date() -> String {
    time::OffsetDateTime::now_utc().date().to_string()
}

fn read_git_branch(repo_path: &Path, fallback: &str) -> String {
    if let Ok(head) = std::fs::read_to_string(repo_path.join(".git").join("HEAD"))
        && let Some(branch) = head.trim().strip_prefix("ref: refs/heads/")
        && !branch.is_empty()
    {
        return branch.to_string();
    }
    fallback.into()
}

#[cfg(windows)]
#[tauri::command]
async fn choose_watch_folder() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let Some(path) = folder_picker::pick()? else {
            return Ok(None);
        };
        let path = dunce::canonicalize(path).map_err(|error| error.to_string())?;
        if !path.is_dir() {
            return Err("Elige una carpeta válida".into());
        }
        let path_text = path.display().to_string();
        let state_path = LocalState::default_path();
        let mut state = LocalState::load(&state_path);
        if !state
            .watched_folders
            .iter()
            .any(|saved| normalized_path(saved) == normalized_path(&path_text))
        {
            state.watched_folders.push(path_text.clone());
            state.save(&state_path).map_err(|error| error.to_string())?;
        }
        Ok(Some(path_text))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(not(windows))]
#[tauri::command]
async fn choose_watch_folder() -> Result<Option<String>, String> {
    Err("El selector de carpetas aún no está disponible en este sistema".into())
}

#[tauri::command]
fn remove_watch_folder(path: String) -> Result<(), String> {
    let state_path = LocalState::default_path();
    let mut state = LocalState::load(&state_path);
    let before = state.watched_folders.len();
    state
        .watched_folders
        .retain(|saved| normalized_path(saved) != normalized_path(&path));
    if state.watched_folders.len() == before {
        return Err("La carpeta no estaba vigilada".into());
    }
    state.save(&state_path).map_err(|error| error.to_string())
}

fn build_project_summaries(watched: &[WatchedProject], cards: &[UiCard]) -> Vec<UiProjectSummary> {
    watched
        .iter()
        .map(|project| {
            let name = &project.name;
            let path = &project.path;
            let branch = read_git_branch(path, "—");
            let proj_cards: Vec<_> = cards
                .iter()
                .filter(|c| c.project.eq_ignore_ascii_case(name))
                .collect();
            let open = |k: CardKind| {
                proj_cards
                    .iter()
                    .filter(|c| {
                        c.kind == k && matches!(c.status, CardStatus::New | CardStatus::Accepted)
                    })
                    .count()
            };
            let done = proj_cards
                .iter()
                .filter(|c| c.status == CardStatus::Done)
                .count();
            let dismissed = proj_cards
                .iter()
                .filter(|c| c.status == CardStatus::Dismissed)
                .count();

            UiProjectSummary {
                name: name.clone(),
                path: path.display().to_string(),
                branch,
                active: path.is_dir(),
                errors: open(CardKind::Error),
                tasks: open(CardKind::Task),
                ideas: open(CardKind::Idea),
                done,
                dismissed,
            }
        })
        .collect()
}

/// Identidad de GitHub (vía `gh`) y estado de Claude Code y Ollama.
#[tauri::command]
async fn get_account(app: tauri::AppHandle) -> Result<wakeline_core::account::AccountInfo, String> {
    let version = app.package_info().version.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        wakeline_core::account::read_account(&user_home(), version)
    })
    .await
    .map_err(|error| error.to_string())
}

/// «Salir de Wakeline» desde el menú de la cuenta.
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// La interfaz cambia el idioma del menú de la bandeja.
#[tauri::command]
fn set_tray_labels(
    labels: tauri::State<'_, shell::TrayLabels>,
    open: String,
    quit: String,
) -> Result<(), String> {
    labels.set(&open, &quit).map_err(|e| e.to_string())
}

/// La interfaz dice si avisar de errores nuevos y en qué idioma.
#[tauri::command]
fn set_alert_prefs(
    prefs: tauri::State<'_, std::sync::Mutex<alerts::AlertPrefs>>,
    enabled: bool,
    lang: String,
) {
    if let Ok(mut prefs) = prefs.lock() {
        prefs.enabled = enabled;
        prefs.spanish = lang.starts_with("es");
    }
}

fn project_base_dir(project: &str) -> Result<PathBuf, String> {
    let state = LocalState::load(&LocalState::default_path());
    watched_projects(&state.watched_folders)
        .into_iter()
        .find(|watched| watched.name.eq_ignore_ascii_case(project))
        .map(|watched| watched.path)
        .ok_or_else(|| format!("La carpeta de {project} no está vigilada"))
}

/// Lista una carpeta elegida para el explorador, sin seguir enlaces fuera del proyecto.
#[tauri::command]
fn list_project_files(
    project: String,
    relative_path: Option<String>,
) -> Result<Vec<UiFileEntry>, String> {
    let root = project_base_dir(&project)?;
    let folder = root.join(relative_path.as_deref().unwrap_or(""));
    let canonical_root = dunce::canonicalize(&root).map_err(|error| error.to_string())?;
    let canonical_folder = dunce::canonicalize(&folder).map_err(|error| error.to_string())?;
    if !canonical_folder.starts_with(&canonical_root) || !canonical_folder.is_dir() {
        return Err("La carpeta no pertenece al proyecto vigilado".into());
    }
    let mut entries = Vec::new();
    for entry in std::fs::read_dir(&canonical_folder).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        if file_type.is_symlink() || exclusions::is_excluded(&path) {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if file_type.is_dir()
            && matches!(
                name.as_str(),
                ".git"
                    | "node_modules"
                    | "target"
                    | "dist"
                    | "build"
                    | ".next"
                    | ".expo"
                    | ".turbo"
            )
        {
            continue;
        }
        let relative_path = path
            .strip_prefix(&canonical_root)
            .map_err(|error| error.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        entries.push(UiFileEntry {
            name,
            relative_path,
            is_dir: file_type.is_dir(),
        });
    }
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

fn extract_file_target(base_dir: &Path, raw: &str) -> Option<(PathBuf, Option<u32>)> {
    for token in raw.split_whitespace() {
        let token =
            token.trim_matches(|c: char| matches!(c, '`' | '\'' | '"' | '(' | ')' | ',' | ':'));
        // Formato `archivo:línea` o `archivo(línea,col)`
        let (path_part, line_part) = if let Some((p, line)) = token.rsplit_once(':') {
            if let Ok(line) = line.parse::<u32>() {
                if let Some((file, previous)) = p.rsplit_once(':') {
                    if let Ok(previous_line) = previous.parse::<u32>() {
                        (file, Some(previous_line))
                    } else {
                        (p, Some(line))
                    }
                } else {
                    (p, Some(line))
                }
            } else {
                (token, None)
            }
        } else if let Some((p, rest)) = token.split_once('(') {
            (
                p,
                rest.split([',', ')'])
                    .next()
                    .and_then(|n| n.parse::<u32>().ok()),
            )
        } else {
            (token, None)
        };
        if (path_part.contains('/') || path_part.contains('\\') || path_part.contains('.'))
            && !path_part.starts_with("http")
        {
            let candidate = base_dir.join(path_part);
            if candidate.is_file()
                && !exclusions::is_excluded(&candidate)
                && dunce::canonicalize(&candidate)
                    .ok()
                    .zip(dunce::canonicalize(base_dir).ok())
                    .is_some_and(|(file, root)| file.starts_with(root))
            {
                return Some((candidate, line_part));
            }
        }
    }
    None
}

fn read_code_excerpt(path: &Path, line: Option<u32>) -> Option<String> {
    if exclusions::is_excluded(path) {
        return None;
    }
    let text = std::fs::read_to_string(path).ok()?;
    if text.len() > 1_000_000 {
        return None;
    }
    let lines: Vec<&str> = text.lines().collect();
    let (start, end) = match line {
        Some(line) if line > 0 && (line as usize) <= lines.len() => {
            let line = line as usize;
            (line.saturating_sub(4), (line + 3).min(lines.len()))
        }
        Some(_) => return None,
        None => (0, lines.len().min(24)),
    };
    Some(redact(
        &lines[start..end]
            .iter()
            .enumerate()
            .map(|(offset, text)| format!("{:>4}  {}", start + offset + 1, text))
            .collect::<Vec<_>>()
            .join("\n"),
    ))
}

/// Abre el archivo (y línea) o la carpeta del proyecto en VS Code (`vscode://file/...`).
#[tauri::command]
fn open_in_vscode(
    app: tauri::AppHandle,
    project: String,
    location: String,
    title: String,
) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;

    let base_dir = project_base_dir(&project)?;
    let url = if let Some((file, line)) =
        extract_file_target(&base_dir, &location).or_else(|| extract_file_target(&base_dir, &title))
    {
        let slash = file.to_string_lossy().replace('\\', "/");
        match line {
            Some(n) => format!("vscode://file/{slash}:{n}"),
            None => format!("vscode://file/{slash}"),
        }
    } else {
        let slash = base_dir.to_string_lossy().replace('\\', "/");
        format!("vscode://file/{slash}")
    };
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

/// Abre una ventana de consola en la carpeta del proyecto con `claude --resume <id>`.
#[tauri::command]
fn resume_session(project: String, session_id: Option<String>) -> Result<(), String> {
    let base_dir = project_base_dir(&project)?;
    let safe_id = session_id.and_then(|id| {
        let trimmed = id.trim();
        (!trimmed.is_empty()
            && trimmed
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'))
        .then(|| trimmed.to_string())
    });
    let claude_cmd = match safe_id {
        Some(id) => format!("claude --resume {id}"),
        None => "claude --continue".into(),
    };
    std::process::Command::new("cmd")
        .args([
            "/C",
            "start",
            "Claude Code",
            "/D",
            &base_dir.to_string_lossy(),
            "cmd",
            "/K",
            &claude_cmd,
        ])
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Botón «Probar aviso» de la configuración.
#[tauri::command]
fn test_notification(app: tauri::AppHandle) -> Result<(), String> {
    alerts::send_test(&app)
}

#[tauri::command]
fn get_mcp_executable() -> Option<String> {
    let sibling = std::env::current_exe()
        .ok()?
        .with_file_name(if cfg!(windows) {
            "wakeline.exe"
        } else {
            "wakeline"
        });
    sibling.is_file().then(|| sibling.display().to_string())
}

/// Arranca la app de escritorio con los comandos del núcleo registrados.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();
    // En desarrollo, la instancia vieja puede seguir abierta sin su servidor Vite.
    // Si intercepta `tauri dev`, el proceso nuevo sale y mata el servidor recién iniciado.
    if !tauri::is_dev() {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            shell::show_main(app);
        }));
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let labels = shell::create_tray(app.handle())?;
            app.manage(labels);
            alerts::start(app.handle());

            if let Some(window) = app.get_webview_window(shell::MAIN_WINDOW) {
                shell::fit_to_screen(&window);
                // La página muestra la ventana cuando ya pintó; esto es por si no llega.
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(3));
                    let _ = window.show();
                });
            }
            Ok(())
        })
        // La ✕ esconde la ventana en la bandeja en vez de cerrar la app.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event
                && window.label() == shell::MAIN_WINDOW
            {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_dashboard_data,
            list_project_files,
            choose_watch_folder,
            remove_watch_folder,
            set_card_status,
            create_card,
            export_todo,
            get_account,
            quit_app,
            set_tray_labels,
            set_alert_prefs,
            test_notification,
            get_mcp_executable,
            open_in_vscode,
            resume_session,
        ])
        .run(tauri::generate_context!())
        .expect("no se pudo iniciar Wakeline");
}
