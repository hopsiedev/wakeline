//! Backend de la aplicación de escritorio Wakeline (Tauri v2).
//!
//! Expone comandos para leer las tarjetas reales desde `wakeline-core` (sesiones de
//! Claude Code y documentos `specs/`), cambiar su estado en `%APPDATA%\wakeline` y
//! exportar `docs/TODO.md` a pedido.

mod alerts;
mod distribution;
#[cfg(windows)]
mod folder_picker;
mod github_source;
mod history;
mod intelligence;
mod live;
mod project_commands;
#[cfg(debug_assertions)]
pub mod review;
mod review_tools;
mod shell;
mod startup;
mod update_notice;
mod updates;

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime};

use serde::{Deserialize, Serialize};
use tauri::Manager;
use wakeline_core::code::CodeScanner;
use wakeline_core::commands::{self as wl_commands, CommandResults};
use wakeline_core::docs;
use wakeline_core::exclusions;
use wakeline_core::github;
use wakeline_core::redact::redact;
use wakeline_core::sessions::{claude, scan_files_incremental};
use wakeline_core::signals;
use wakeline_core::store::{ExportItem, LocalState, ManualCard, format_todo_markdown};
use wakeline_core::watch::{is_within, normalized_path};
use wakeline_core::{CardKind, CardStatus, Fingerprint, SourceKind};

pub(crate) static STATE_ACCESS: std::sync::Mutex<()> = std::sync::Mutex::new(());
static SCAN_ACCESS: std::sync::Mutex<()> = std::sync::Mutex::new(());

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
    /// Clave del origen (`session`, `code`, `specs`, `ci`…) que traduce la interfaz; en
    /// los comandos es el nombre del comando.
    pub source_label: String,
    pub location: String,
    pub code_excerpt: Option<String>,
    pub evidence: Option<String>,
    pub session_id: Option<String>,
    pub occurrences: u32,
    pub first_seen: String,
    pub last_seen: String,
    /// Todas las huellas del grupo; cambiar el estado las escribe todas (Q52).
    pub fingerprints: Vec<String>,
    /// Un elemento por origen, para los chips y el Detalle (Q62).
    pub origins: Vec<UiOrigin>,
    /// Enlace a GitHub (issue, PR o job del CI).
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct UiOrigin {
    pub fingerprint: String,
    pub source_kind: SourceKind,
    pub source_label: String,
    pub location: String,
    pub occurrences: u32,
    pub url: Option<String>,
}

/// Un PR abierto de un proyecto, para la vista «Pull requests».
#[derive(Debug, Clone, Serialize)]
pub struct UiPullRequest {
    pub project: String,
    #[serde(flatten)]
    pub info: github::PullRequestInfo,
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
    /// Tiene `wakeline.toml` sin aprobar o con cambios sin revisar.
    pub commands_pending: bool,
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
    pub pull_requests: Vec<UiPullRequest>,
    pub session_files: usize,
    pub megabytes_read: f64,
    pub scan_ms: u64,
}

#[derive(Debug, Deserialize)]
pub struct StatusInput {
    pub fingerprint: String,
    /// Huellas del grupo; si falta, solo `fingerprint`.
    #[serde(default)]
    pub fingerprints: Vec<String>,
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
    let result = tauri::async_runtime::spawn_blocking(scan_dashboard)
        .await
        .map_err(|error| error.to_string())?;
    if result.is_ok() {
        live::scanned();
    }
    result
}

fn scan_dashboard() -> Result<DashboardPayload, String> {
    let _scan = SCAN_ACCESS
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let started = Instant::now();
    let state_path = LocalState::default_path();
    let mut state = {
        let _guard = STATE_ACCESS
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        LocalState::load(&state_path)
    };
    let snapshot = state.clone();
    let watched = watched_projects(&state.watched_folders);

    if watched.is_empty() {
        return Ok(DashboardPayload {
            cards: Vec::new(),
            projects: Vec::new(),
            spec_gaps: Vec::new(),
            pull_requests: Vec::new(),
            session_files: 0,
            megabytes_read: 0.0,
            scan_ms: started.elapsed().as_millis() as u64,
        });
    }

    let home = user_home();
    let sessions_root = home.join(".claude").join("projects");
    let cutoff = SystemTime::now() - Duration::from_secs(30 * 24 * 3600);

    let mut files = if sessions_root.is_dir() {
        claude::discover(&sessions_root).map_err(|error| error.to_string())?
    } else {
        Vec::new()
    };
    files.retain(|f| {
        state.full_session_history
            || std::fs::metadata(&f.path)
                .and_then(|m| m.modified())
                .ok()
                .is_none_or(|m| m >= cutoff)
    });
    let mut scoped_files = Vec::new();
    for file in files {
        if claude::belongs_to_watched(&file, &state.watched_folders)
            .map_err(|error| error.to_string())?
        {
            scoped_files.push(file);
        }
    }
    let files = scoped_files;

    let report = scan_files_incremental(&files, &mut state).map_err(|error| error.to_string())?;
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
            .map(|id| format!("{id} · {branch}"))
            .unwrap_or_else(|| branch.clone());
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
            source_label: "session".into(),
            location,
            code_excerpt,
            evidence: sc.evidence,
            session_id: (!sc.session_id.is_empty()).then_some(sc.session_id),
            occurrences: sc.occurrences,
            first_seen,
            last_seen,
            fingerprints: Vec::new(),
            origins: Vec::new(),
            url: None,
        });
    }

    let mut spec_gaps = Vec::new();
    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or_default();
    let mut code_scanner = CodeScanner::new();
    let command_results = CommandResults::load(&wl_commands::results_path());
    let github_cache = github::GithubCache::load(&github::cache_path());
    let mut pull_requests: Vec<UiPullRequest> = Vec::new();

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
                    "specs".into()
                } else {
                    "roadmap".into()
                },
                location: dc.location,
                code_excerpt,
                evidence: None,
                session_id: None,
                occurrences: 1,
                first_seen: today_date(),
                last_seen: today_date(),
                fingerprints: Vec::new(),
                origins: Vec::new(),
                url: None,
            });
        }

        let branch = read_git_branch(&watched_project.path, "—");
        let known_branch = (branch != "—").then_some(branch.as_str());
        let code_cards = code_scanner.scan_project(&watched_project.path);
        signals::reconcile_code(
            &mut state,
            &watched_project.path,
            &watched_project.name,
            known_branch,
            &code_cards,
            code_scanner.last_scan_complete(),
            now,
        );
        for cc in code_cards {
            let fp_str = cc.fingerprint.as_str().to_string();
            let status = state.status_for(&fp_str);
            let short_id = format!("W-{:03}", cards.len() + 1);
            let code_excerpt = read_code_excerpt(
                &watched_project.path.join(&cc.path),
                u32::try_from(cc.line).ok(),
            );
            cards.push(UiCard {
                fingerprint: fp_str,
                short_id,
                kind: cc.kind,
                status,
                location: cc.location(),
                title: cc.title,
                project: watched_project.name.clone(),
                branch: branch.clone(),
                source_kind: SourceKind::Comment,
                source_label: "code".into(),
                code_excerpt,
                evidence: None,
                session_id: None,
                occurrences: cc.occurrences,
                first_seen: today_date(),
                last_seen: today_date(),
                fingerprints: Vec::new(),
                origins: Vec::new(),
                url: None,
            });
        }

        for result in command_results.for_project(&watched_project.path) {
            signals::reconcile_command(
                &mut state,
                &watched_project.path,
                &watched_project.name,
                known_branch,
                result,
                now,
            );
            let finished = unix_date(result.finished_at);
            for card in &result.cards {
                let fp_str = card.fingerprint.as_str().to_string();
                let status = state.status_for(&fp_str);
                let short_id = format!("W-{:03}", cards.len() + 1);
                let code_excerpt = card.path.as_ref().and_then(|path| {
                    read_code_excerpt(
                        &watched_project.path.join(path),
                        card.line.and_then(|l| u32::try_from(l).ok()),
                    )
                });
                cards.push(UiCard {
                    fingerprint: fp_str,
                    short_id,
                    kind: card.kind,
                    status,
                    title: card.title.clone(),
                    project: watched_project.name.clone(),
                    branch: branch.clone(),
                    source_kind: SourceKind::Command,
                    source_label: result.command.clone(),
                    location: card
                        .location()
                        .unwrap_or_else(|| wl_commands::CONFIG_FILE.into()),
                    code_excerpt,
                    evidence: card.evidence.clone(),
                    session_id: None,
                    occurrences: card.occurrences,
                    first_seen: finished.clone(),
                    last_seen: finished.clone(),
                    fingerprints: Vec::new(),
                    origins: Vec::new(),
                    url: None,
                });
            }
        }

        if let Some(snapshot) = github_cache.get(&watched_project.path) {
            signals::reconcile_github(
                &mut state,
                &watched_project.path,
                &watched_project.name,
                snapshot,
                now,
            );
            let fetched = unix_date(snapshot.fetched_at);
            for card in &snapshot.cards {
                let fp_str = card.fingerprint.as_str().to_string();
                let status = state.status_for(&fp_str);
                let code_excerpt = card.path.as_ref().and_then(|path| {
                    read_code_excerpt(
                        &watched_project.path.join(path),
                        card.line.and_then(|l| u32::try_from(l).ok()),
                    )
                });
                cards.push(UiCard {
                    fingerprint: fp_str,
                    short_id: String::new(),
                    kind: card.kind,
                    status,
                    title: card.title.clone(),
                    project: watched_project.name.clone(),
                    branch: card.branch.clone().unwrap_or_else(|| branch.clone()),
                    source_kind: card.source,
                    source_label: card.label.clone(),
                    location: card.location(),
                    code_excerpt,
                    evidence: None,
                    session_id: None,
                    occurrences: card.occurrences,
                    first_seen: fetched.clone(),
                    last_seen: fetched.clone(),
                    fingerprints: Vec::new(),
                    origins: Vec::new(),
                    url: Some(card.url.clone()),
                });
            }
            pull_requests.extend(snapshot.pull_requests.iter().map(|info| UiPullRequest {
                project: watched_project.name.clone(),
                info: info.clone(),
            }));
        }
    }

    state = {
        let _guard = STATE_ACCESS
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let latest = LocalState::load(&state_path);
        let merged = wakeline_core::scan_state::merge_scan(&snapshot, &state, latest);
        merged
            .save(&state_path)
            .map_err(|error| error.to_string())?;
        merged
    };
    let watched = if state.watched_folders == snapshot.watched_folders {
        watched
    } else {
        watched_projects(&state.watched_folders)
    };
    cards.retain(|card| watched.iter().any(|project| project.name == card.project));
    for card in &mut cards {
        card.status = state.status_for(&card.fingerprint);
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
            source_label: "manual".into(),
            location: "Wakeline".into(),
            code_excerpt: None,
            evidence: None,
            session_id: None,
            occurrences: 1,
            first_seen: mc.created_at.clone(),
            last_seen: mc.created_at.clone(),
            fingerprints: Vec::new(),
            origins: Vec::new(),
            url: None,
        });
    }

    // Señales que se cerraron solas: se siguen viendo como hechas un tiempo.
    for watched_project in &watched {
        for (fp, memo) in signals::closed_in_project(&state, &watched_project.path) {
            let seen = unix_date(memo.last_seen);
            cards.push(UiCard {
                fingerprint: fp.clone(),
                short_id: String::new(),
                kind: memo.kind,
                status: CardStatus::Done,
                title: memo.title.clone(),
                project: watched_project.name.clone(),
                branch: memo.branch.clone().unwrap_or_else(|| "—".into()),
                source_kind: memo.source,
                source_label: memo.label.clone(),
                location: memo.location.clone().unwrap_or_default(),
                code_excerpt: None,
                evidence: None,
                session_id: None,
                occurrences: 0,
                first_seen: seen.clone(),
                last_seen: seen,
                fingerprints: Vec::new(),
                origins: Vec::new(),
                url: None,
            });
        }
    }
    let mut cards = group_cards(cards, &state);

    cards.sort_by(|a, b| {
        kind_rank(a.kind)
            .cmp(&kind_rank(b.kind))
            .then_with(|| b.last_seen.cmp(&a.last_seen))
            .then_with(|| b.occurrences.cmp(&a.occurrences))
    });

    let projects = build_project_summaries(&watched, &cards, &state);
    let megabytes_read = bytes as f64 / 1_048_576.0;
    let scan_ms = started.elapsed().as_millis() as u64;

    Ok(DashboardPayload {
        cards,
        projects,
        spec_gaps,
        pull_requests,
        session_files: files.len(),
        megabytes_read,
        scan_ms,
    })
}

#[tauri::command(async)]
fn set_card_status(input: StatusInput) -> Result<(), String> {
    set_cards_status(vec![input])
}

#[tauri::command(async)]
fn set_cards_status(inputs: Vec<StatusInput>) -> Result<(), String> {
    let _guard = STATE_ACCESS
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let path = LocalState::default_path();
    let mut state = LocalState::load(&path);
    for input in inputs {
        let mut fingerprints = input.fingerprints;
        if !fingerprints.contains(&input.fingerprint) {
            fingerprints.push(input.fingerprint);
        }
        signals::set_group_status(&mut state, &fingerprints, input.status);
    }
    state.save(&path).map_err(|e| e.to_string())
}

#[tauri::command(async)]
fn create_card(input: CreateCardInput) -> Result<String, String> {
    let _guard = STATE_ACCESS
        .lock()
        .unwrap_or_else(|error| error.into_inner());
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

/// Junta en una tarjeta los orígenes con la misma clave de grupo (Q52, Q62).
fn group_cards(cards: Vec<UiCard>, state: &LocalState) -> Vec<UiCard> {
    let keys: Vec<String> = cards
        .iter()
        .map(|card| {
            let branch = (card.branch != "—").then_some(card.branch.as_str());
            // El CI rojo lleva `archivo:línea` igual que el error local: se juntan (Q53).
            let path = (card.source_kind != SourceKind::Session).then_some(card.location.as_str());
            format!(
                "{}\u{1f}{}",
                card.project.to_lowercase(),
                signals::group_key(card.kind, branch, path, &card.title)
            )
        })
        .collect();
    let mut slots: Vec<Option<UiCard>> = cards.into_iter().map(Some).collect();
    let mut grouped = Vec::new();
    for members in signals::group_indices(&keys) {
        let mut parts: Vec<UiCard> = members
            .iter()
            .filter_map(|&idx| slots[idx].take())
            .collect();
        // La tarjeta visible es la del origen abierto más reciente.
        parts.sort_by(|a, b| {
            (a.status == CardStatus::Done)
                .cmp(&(b.status == CardStatus::Done))
                .then_with(|| b.last_seen.cmp(&a.last_seen))
        });
        let mut card = parts[0].clone();
        let members: Vec<(&str, SourceKind)> = parts
            .iter()
            .map(|p| (p.fingerprint.as_str(), p.source_kind))
            .collect();
        card.status = signals::group_status(state, &members);
        card.occurrences = parts.iter().map(|p| p.occurrences).sum();
        card.first_seen = parts
            .iter()
            .map(|p| p.first_seen.clone())
            .min()
            .unwrap_or_default();
        card.fingerprints = parts.iter().map(|p| p.fingerprint.clone()).collect();
        card.origins = parts
            .iter()
            .map(|p| UiOrigin {
                fingerprint: p.fingerprint.clone(),
                source_kind: p.source_kind,
                source_label: p.source_label.clone(),
                location: p.location.clone(),
                occurrences: p.occurrences,
                url: p.url.clone(),
            })
            .collect();
        grouped.push(card);
    }
    for (idx, card) in grouped.iter_mut().enumerate() {
        card.short_id = format!("W-{:03}", idx + 1);
    }
    grouped
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

fn unix_date(seconds: u64) -> String {
    i64::try_from(seconds)
        .ok()
        .and_then(|s| time::OffsetDateTime::from_unix_timestamp(s).ok())
        .map(|t| t.date().to_string())
        .unwrap_or_else(today_date)
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

#[tauri::command]
async fn choose_watch_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        let picked = folder_picker::pick()?;
        #[cfg(not(windows))]
        let picked = {
            use tauri_plugin_dialog::DialogExt;
            app.dialog()
                .file()
                .blocking_pick_folder()
                .map(|path| path.into_path().map_err(|error| error.to_string()))
                .transpose()?
        };
        let Some(path) = picked else {
            return Ok(None);
        };
        let path = dunce::canonicalize(path).map_err(|error| error.to_string())?;
        if !path.is_dir() {
            return Err("Elige una carpeta válida".into());
        }
        let path_text = path.display().to_string();
        let state_path = LocalState::default_path();
        let _guard = STATE_ACCESS
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let mut state = LocalState::load(&state_path);
        if !state
            .watched_folders
            .iter()
            .any(|saved| normalized_path(saved) == normalized_path(&path_text))
        {
            state.watched_folders.push(path_text.clone());
            state.save(&state_path).map_err(|error| error.to_string())?;
            live::restart(&app);
        }
        github_source::pushed(&app, &path);
        Ok(Some(path_text))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command(async)]
fn remove_watch_folder(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let _guard = STATE_ACCESS
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let state_path = LocalState::default_path();
    let mut state = LocalState::load(&state_path);
    let before = state.watched_folders.len();
    state
        .watched_folders
        .retain(|saved| normalized_path(saved) != normalized_path(&path));
    if state.watched_folders.len() == before {
        return Err("La carpeta no estaba vigilada".into());
    }
    state.save(&state_path).map_err(|error| error.to_string())?;
    live::restart(&app);
    Ok(())
}

fn build_project_summaries(
    watched: &[WatchedProject],
    cards: &[UiCard],
    state: &LocalState,
) -> Vec<UiProjectSummary> {
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
                commands_pending: project_commands::pending_approval(state, path),
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

#[tauri::command]
async fn get_github_workspace(
    since: String,
    force: Option<bool>,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if force.unwrap_or(false) {
            wakeline_core::github_workspace::refreshed(&since)
        } else {
            wakeline_core::github_workspace::cached(&since)
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn get_remote_pr_details(
    repository: String,
    number: u64,
) -> Result<github::PullRequestDetails, String> {
    if !wakeline_core::github_workspace::valid_repository(&repository) {
        return Err("INVALID_REPOSITORY".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        github::fetch_pr_details(&github::SystemGh, &repository, number)
            .map_err(|error| redact(&error.to_string()))
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Pregunta a Claude sobre una PR. El agente no tiene herramientas: solo ve el
/// título, la descripción y el diff (sin archivos excluidos y con secretos tapados).
pub(crate) fn answer_pr_question(
    repository: &str,
    number: u64,
    title: &str,
    options: &wakeline_core::agents::ReviewOptions,
    question: &str,
    history: &[wakeline_core::agents::ChatTurn],
    lang: &str,
) -> Result<String, String> {
    if !wakeline_core::github_workspace::valid_repository(repository) {
        return Err("INVALID_REPOSITORY".into());
    }
    if question.trim().is_empty() || question.len() > 8_000 {
        return Err("INVALID_QUESTION".into());
    }
    let details = github::fetch_pr_details(&github::SystemGh, repository, number)
        .map_err(|error| redact(&error.to_string()))?;
    let prompt = wakeline_core::agents::pr_chat_prompt(
        repository,
        number,
        title,
        &details,
        history,
        question,
        lang.starts_with("es"),
    );
    wakeline_core::agents::ask_review(options, &prompt, &std::sync::atomic::AtomicBool::new(false))
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
async fn ask_pr_agent(
    repository: String,
    number: u64,
    title: String,
    options: wakeline_core::agents::ReviewOptions,
    question: String,
    history: Vec<wakeline_core::agents::ChatTurn>,
    lang: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        answer_pr_question(
            &repository,
            number,
            &title,
            &options,
            &question,
            &history,
            &lang,
        )
    })
    .await
    .map_err(|error| error.to_string())?
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
    errors: Option<bool>,
    pull_requests: Option<bool>,
) {
    if let Ok(mut prefs) = prefs.lock() {
        prefs.enabled = enabled;
        prefs.errors = errors.unwrap_or(true);
        prefs.pull_requests = pull_requests.unwrap_or(true);
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
#[tauri::command(async)]
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

/// Opens a project or validated file target in the selected supported editor.
#[tauri::command]
async fn open_in_editor(
    project: String,
    location: String,
    title: String,
    editor: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let base_dir = project_base_dir(&project)?;
        let target = extract_file_target(&base_dir, &location)
            .or_else(|| extract_file_target(&base_dir, &title));
        review_tools::open_local_editor(&editor, base_dir, target)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command(async)]
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
#[tauri::command(async)]
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
    #[cfg(not(windows))]
    {
        let mut terminal = std::process::Command::new("x-terminal-emulator");
        terminal.current_dir(&base_dir).args(["-e", "claude"]);
        if let Some(id) = safe_id {
            terminal.args(["--resume", &id]);
        } else {
            terminal.arg("--continue");
        }
        terminal
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string())
    }
    #[cfg(windows)]
    {
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
}

#[tauri::command(async)]
fn get_mcp_executable(app: tauri::AppHandle) -> Option<String> {
    #[cfg(target_os = "linux")]
    {
        if let Some(image) = std::env::var_os("APPIMAGE") {
            let cli = PathBuf::from(image).with_file_name("wakeline");
            return cli.is_file().then(|| cli.display().to_string());
        }
        let installed = Path::new("/usr/bin/wakeline");
        if installed.is_file() {
            return Some(installed.display().to_string());
        }
    }
    let sibling = std::env::current_exe()
        .ok()?
        .with_file_name(if cfg!(windows) {
            "wakeline.exe"
        } else {
            "wakeline"
        });
    if sibling.is_file() {
        return Some(sibling.display().to_string());
    }
    let resource = app.path().resource_dir().ok()?.join("wakeline");
    resource.is_file().then(|| resource.display().to_string())
}

#[tauri::command(async)]
fn get_startup_enabled() -> Result<bool, String> {
    startup::enabled()
}
#[tauri::command(async)]
fn set_startup_enabled(enabled: bool) -> Result<bool, String> {
    startup::set_enabled(enabled)
}
#[tauri::command]
fn is_background_start() -> bool {
    startup::background(std::env::args())
}
#[tauri::command]
fn get_watch_status(app: tauri::AppHandle) -> live::WatchStatus {
    live::status(&app)
}

/// Arranca la app de escritorio con los comandos del núcleo registrados.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();
    #[cfg(not(windows))]
    {
        builder = builder.plugin(tauri_plugin_dialog::init());
    }
    // En desarrollo, la instancia vieja puede seguir abierta sin su servidor Vite.
    // Si intercepta `tauri dev`, el proceso nuevo sale y mata el servidor recién iniciado.
    if !tauri::is_dev() {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if !startup::background(_args.iter()) {
                shell::show_main(app);
            }
        }));
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let labels = shell::create_tray(app.handle())?;
            app.manage(labels);
            alerts::start(app.handle());
            project_commands::start(app.handle());
            github_source::start(app.handle());
            live::start(app.handle());
            updates::start(app.handle());

            if let Some(window) = app.get_webview_window(shell::MAIN_WINDOW)
                && !startup::background(std::env::args())
            {
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
            if cfg!(windows)
                && let tauri::WindowEvent::CloseRequested { api, .. } = event
                && window.label() == shell::MAIN_WINDOW
            {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_github_workspace,
            get_remote_pr_details,
            ask_pr_agent,
            review_tools::get_review_agents,
            review_tools::ask_review_agent,
            review_tools::open_pr_editor,
            get_startup_enabled,
            set_startup_enabled,
            is_background_start,
            get_watch_status,
            get_dashboard_data,
            list_project_files,
            choose_watch_folder,
            remove_watch_folder,
            set_card_status,
            set_cards_status,
            create_card,
            export_todo,
            get_account,
            quit_app,
            set_tray_labels,
            set_alert_prefs,
            intelligence::get_intelligence,
            intelligence::set_intelligence,
            get_mcp_executable,
            open_in_vscode,
            open_in_editor,
            resume_session,
            project_commands::get_project_commands,
            project_commands::approve_project_commands,
            project_commands::run_project_command,
            github_source::get_github_status,
            github_source::refresh_github,
            github_source::get_pull_request_details,
            updates::check_update,
            updates::install_update,
            history::import_all_history,
            history::history_import_status,
        ])
        .run(tauri::generate_context!())
        .expect("no se pudo iniciar Wakeline");
}
