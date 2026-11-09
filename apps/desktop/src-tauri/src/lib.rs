//! Backend de la aplicación de escritorio Wakeline (Tauri v2).
//!
//! Expone comandos para leer las tarjetas reales desde `wakeline-core` (sesiones de
//! Claude Code y documentos `specs/`), cambiar su estado en `%APPDATA%\wakeline` y
//! exportar `docs/TODO.md` a pedido.

mod alerts;
mod shell;

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime};

use serde::{Deserialize, Serialize};
use tauri::Manager;
use wakeline_core::docs;
use wakeline_core::sessions::{cards_from_events, claude};
use wakeline_core::store::{ExportItem, LocalState, ManualCard, format_todo_markdown};
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
    let state = LocalState::load(&state_path);

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

    let mut bytes = 0u64;
    let mut events = Vec::new();
    for file in &files {
        if let Ok(read) = claude::read_from(&file.path, 0) {
            bytes += read.offset;
            events.extend(read.events);
        }
    }

    let session_cards = cards_from_events(&events);
    let mut cards: Vec<UiCard> = Vec::new();

    for (idx, sc) in session_cards.into_iter().enumerate() {
        let project = project_name_from_cwd(sc.cwd.as_deref());
        let fp_str = sc.fingerprint.as_str().to_string();
        let status = state.status_for(&fp_str);
        let branch = sc.git_branch.unwrap_or_else(|| "main".into());
        let last_seen = sc
            .last_seen
            .as_deref()
            .map(short_date)
            .unwrap_or_else(|| "hoy".into());
        let first_seen = sc
            .first_seen
            .as_deref()
            .map(short_date)
            .unwrap_or_else(|| last_seen.clone());
        let short_id = format!("W-{:03}", idx + 1);
        let location = sc
            .session_id
            .get(..7)
            .map(|id| format!("sesión {id} · {branch}"))
            .unwrap_or_else(|| format!("sesión · {branch}"));

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
            session_id: (!sc.session_id.is_empty()).then_some(sc.session_id),
            occurrences: sc.occurrences,
            first_seen,
            last_seen,
        });
    }

    let contastack_dir = home.join("contastack");
    let doc_cards = docs::scan_project_docs(&contastack_dir).unwrap_or_default();
    let mut spec_gaps = Vec::new();

    for dc in doc_cards {
        spec_gaps.push(UiSpecGap {
            title: dc.title.clone(),
            location: dc.location.clone(),
            tag: dc.tag.clone(),
            kind: dc.kind,
        });
        let fp_str = dc.fingerprint.as_str().to_string();
        let status = state.status_for(&fp_str);
        let short_id = format!("W-{:03}", cards.len() + 1);
        cards.push(UiCard {
            fingerprint: fp_str,
            short_id,
            kind: dc.kind,
            status,
            title: dc.title,
            project: "Contastack".into(),
            branch: "main".into(),
            source_kind: SourceKind::Document,
            source_label: if dc.location.starts_with("specs/") {
                "specs/".into()
            } else {
                "Hoja de ruta".into()
            },
            location: dc.location,
            session_id: None,
            occurrences: 1,
            first_seen: "2026-11-04".into(),
            last_seen: "2026-11-08".into(),
        });
    }

    for mc in &state.manual_cards {
        let status = state.status_for(&mc.fingerprint);
        let short_id = format!("W-{:03}", cards.len() + 1);
        cards.push(UiCard {
            fingerprint: mc.fingerprint.clone(),
            short_id,
            kind: mc.kind,
            status,
            title: mc.title.clone(),
            project: mc.project.clone(),
            branch: mc.branch.clone().unwrap_or_else(|| "main".into()),
            source_kind: SourceKind::Comment,
            source_label: "Manual".into(),
            location: "creada en Wakeline".into(),
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

    let projects = build_project_summaries(&home, &cards);
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
    let path = LocalState::default_path();
    let mut state = LocalState::load(&path);
    let fp = Fingerprint::new(input.kind, SourceKind::Comment, Some(&input.project), title);
    let fp_str = fp.as_str().to_string();
    state.manual_cards.push(ManualCard {
        fingerprint: fp_str.clone(),
        kind: input.kind,
        title: title.to_string(),
        project: input.project,
        branch: Some("main".into()),
        created_at: "2026-11-08".into(),
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
    let target_project = project_name.unwrap_or_else(|| "Contastack".into());
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
    let home = user_home();
    let base_dir = if target_project.eq_ignore_ascii_case("wakeline") {
        home.join("app").join("bitacora")
    } else if target_project.eq_ignore_ascii_case("app-expo") {
        home.join("contastack").join("app-expo")
    } else {
        home.join("contastack")
    };
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

fn project_name_from_cwd(cwd: Option<&str>) -> String {
    let Some(raw) = cwd else {
        return "Contastack".into();
    };
    let lower = raw.replace('\\', "/").to_lowercase();
    if lower.contains("app-expo") {
        "app-expo".into()
    } else if lower.contains("bitacora") || lower.contains("wakeline") {
        "wakeline".into()
    } else if lower.contains("contastack") {
        "Contastack".into()
    } else {
        Path::new(raw)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "Proyecto".into())
    }
}

fn short_date(ts: &str) -> String {
    ts.get(..10).unwrap_or(ts).to_string()
}

fn build_project_summaries(home: &Path, cards: &[UiCard]) -> Vec<UiProjectSummary> {
    let defs = [
        ("Contastack", home.join("contastack"), "main", true),
        (
            "app-expo",
            home.join("contastack").join("app-expo"),
            "app-movil-expo",
            true,
        ),
        (
            "wakeline",
            home.join("app").join("bitacora"),
            "interfaz-datos-reales",
            true,
        ),
    ];

    defs.into_iter()
        .map(|(name, path, branch, active)| {
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
                name: name.into(),
                path: path.display().to_string(),
                branch: branch.into(),
                active,
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

/// Botón «Probar aviso» de la configuración.
#[tauri::command]
fn test_notification(app: tauri::AppHandle) -> Result<(), String> {
    alerts::send_test(&app)
}

/// Arranca la app de escritorio con los comandos del núcleo registrados.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Una sola copia: abrir Wakeline otra vez trae al frente la que ya corre.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            shell::show_main(app);
        }))
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
            set_card_status,
            create_card,
            export_todo,
            get_account,
            quit_app,
            set_tray_labels,
            set_alert_prefs,
            test_notification,
        ])
        .run(tauri::generate_context!())
        .expect("no se pudo iniciar Wakeline");
}
