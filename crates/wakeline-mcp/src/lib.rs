//! Servidor MCP de Wakeline por stdio (JSON-RPC 2.0).
//!
//! Solo toca el To Do: crea, lista y mueve tarjetas. No lee carpetas de proyectos,
//! sesiones ni documentos; trabaja con `state.json` y el índice que escribe la app.
//! Nunca borra: no existe una herramienta de borrado.

use std::io::{self, BufRead, Write};
use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use wakeline_core::redact::redact;
use wakeline_core::signals::set_group_status;
use wakeline_core::store::{LocalState, ManualCard};
use wakeline_core::todo_index::{self, TodoEntry};
use wakeline_core::watch::is_within;
use wakeline_core::{CardKind, CardStatus, Fingerprint, SourceKind};

/// Herramientas expuestas por el servidor MCP, en este orden.
pub const TOOL_NAMES: [&str; 5] = [
    "list_cards",
    "get_card",
    "create_card",
    "move_card",
    "complete_card",
];

#[derive(Deserialize)]
struct RpcRequest {
    jsonrpc: String,
    #[serde(default)]
    id: Value,
    method: String,
    #[serde(default)]
    params: Value,
}

#[derive(Serialize)]
pub struct RpcResponse {
    pub jsonrpc: &'static str,
    pub id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<Value>,
}

/// Arranca el bucle MCP leyendo peticiones JSON-RPC por línea desde `stdin`.
pub fn serve_stdio() -> io::Result<()> {
    let stdin = io::stdin();
    let mut stdout = io::stdout();
    for line in stdin.lock().lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        if let Some(resp) = handle_line(&line) {
            let out = serde_json::to_string(&resp).map_err(io::Error::other)?;
            writeln!(stdout, "{out}")?;
            stdout.flush()?;
        }
    }
    Ok(())
}

pub fn handle_line(line: &str) -> Option<RpcResponse> {
    let req: RpcRequest = serde_json::from_str(line).ok()?;
    let _ = &req.jsonrpc;
    if req.method.starts_with("notifications/") {
        return None;
    }
    let requested_version = req.params["_meta"]["io.modelcontextprotocol/protocolVersion"].as_str();
    let modern = requested_version == Some("2026-07-28");
    let result = if let Some(version) = requested_version.filter(|version| *version != "2026-07-28")
    {
        Err(json!({
            "code": -32022,
            "message": "Unsupported protocol version",
            "data": { "supported": ["2026-07-28", "2025-11-25", "2024-11-05"], "requested": version }
        }))
    } else {
        match req.method.as_str() {
            "server/discover" => Ok(json!({
                "resultType": "complete",
                "supportedVersions": ["2026-07-28", "2025-11-25", "2024-11-05"],
                "capabilities": { "tools": {} },
                "_meta": { "io.modelcontextprotocol/serverInfo": { "name": "wakeline", "version": env!("CARGO_PKG_VERSION") } }
            })),
            "initialize" => Ok(json!({
                "protocolVersion": match req.params["protocolVersion"].as_str() {
                    Some("2024-11-05") => "2024-11-05",
                    _ => "2025-11-25",
                },
                "capabilities": { "tools": {} },
                "serverInfo": { "name": "wakeline", "version": env!("CARGO_PKG_VERSION") }
            })),
            "ping" => Ok(json!({})),
            "tools/list" => Ok(tools_list()),
            "tools/call" => call_tool(&req.params),
            _ => Err(json!({ "code": -32601, "message": "Método no soportado" })),
        }
    };
    let result = result.map(|mut value| {
        if modern && let Some(object) = value.as_object_mut() {
            object.insert("resultType".into(), json!("complete"));
            object.insert("_meta".into(), json!({
                "io.modelcontextprotocol/serverInfo": { "name": "wakeline", "version": env!("CARGO_PKG_VERSION") }
            }));
        }
        value
    });
    Some(match result {
        Ok(res) => RpcResponse {
            jsonrpc: "2.0",
            id: req.id,
            result: Some(res),
            error: None,
        },
        Err(err) => RpcResponse {
            jsonrpc: "2.0",
            id: req.id,
            result: None,
            error: Some(err),
        },
    })
}

fn tools_list() -> Value {
    let id = json!({ "type": "string", "description": "Card id (W-001) or fingerprint" });
    json!({
        "tools": [
            {
                "name": "list_cards",
                "description": "List the user's Wakeline To Do cards (pending and in progress; add include_closed for done and dismissed). Reads only Wakeline's own To Do, never project folders.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "project": { "type": "string", "description": "Only this project" },
                        "include_closed": { "type": "boolean" }
                    }
                }
            },
            {
                "name": "get_card",
                "description": "Get one Wakeline To Do card by id or fingerprint.",
                "inputSchema": { "type": "object", "properties": { "id": id }, "required": ["id"] }
            },
            {
                "name": "create_card",
                "description": "Add a card to the user's Wakeline To Do, e.g. when they ask to add a task or bug to Wakeline. Works for any project, watched or not; without project it uses the current folder's name (only the name is used).",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "title": { "type": "string" },
                        "project": { "type": "string" },
                        "kind": { "type": "string", "enum": ["task", "error", "idea"] }
                    },
                    "required": ["title"]
                }
            },
            {
                "name": "move_card",
                "description": "Move a Wakeline To Do card: todo (pending), in_progress, done or dismissed. Never deletes.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "id": id,
                        "status": { "type": "string", "enum": ["todo", "in_progress", "done", "dismissed"] }
                    },
                    "required": ["id", "status"]
                }
            },
            {
                "name": "complete_card",
                "description": "Mark a Wakeline To Do card as done without deleting it.",
                "inputSchema": { "type": "object", "properties": { "id": id }, "required": ["id"] }
            }
        ]
    })
}

fn call_tool(params: &Value) -> Result<Value, Value> {
    let name = params["name"].as_str().unwrap_or_default();
    let args = &params["arguments"];
    let path = LocalState::default_path();
    let mut state = LocalState::load(&path);
    let index = todo_index::load(&todo_index::index_path());
    let id = args["id"]
        .as_str()
        .or_else(|| args["fingerprint"].as_str())
        .unwrap_or_default();

    let changed = match name {
        "list_cards" => {
            let project = args["project"].as_str();
            let closed = args["include_closed"].as_bool().unwrap_or(false);
            let cards: Vec<Value> = todo(&state, &index)
                .iter()
                .filter(|card| {
                    closed || matches!(card.status, CardStatus::New | CardStatus::Accepted)
                })
                .filter(|card| project.is_none_or(|name| card.project.eq_ignore_ascii_case(name)))
                .map(card_json)
                .collect();
            return Ok(text_content(
                &serde_json::to_string_pretty(&cards).unwrap_or_default(),
            ));
        }
        "get_card" => {
            let cards = todo(&state, &index);
            let card = find(&cards, id).ok_or_else(not_found)?;
            return Ok(text_content(&card_json(card).to_string()));
        }
        "create_card" => {
            let title = args["title"].as_str().unwrap_or_default().trim();
            if title.is_empty() {
                return Err(json!({ "code": -32602, "message": "Missing title" }));
            }
            let cwd = std::env::current_dir().ok();
            let (project, unwatched) =
                project_for(&state, args["project"].as_str(), cwd.as_deref())?;
            let kind = match args["kind"].as_str() {
                Some("error") => CardKind::Error,
                Some("idea") => CardKind::Idea,
                _ => CardKind::Task,
            };
            let fp = create(&mut state, &redact(title), kind, &project, unwatched);
            format!("Added to Wakeline To Do in {project} ({fp})")
        }
        "move_card" | "complete_card" => {
            let status = if name == "complete_card" {
                CardStatus::Done
            } else {
                parse_status(args["status"].as_str().unwrap_or_default()).ok_or_else(|| {
                    json!({ "code": -32602, "message": "status must be todo, in_progress, done or dismissed" })
                })?
            };
            let title = move_card(&mut state, &index, id, status)?;
            format!("Moved \u{201c}{title}\u{201d} to {}", status_name(status))
        }
        _ => return Err(json!({ "code": -32601, "message": "Unknown tool" })),
    };
    state.save(&path).map_err(storage_error)?;
    // The app watches this file and reloads To Do right away.
    let _ = todo_index::signal(&todo_index::signal_path());
    Ok(text_content(&changed))
}

/// To Do as the app last showed it, plus cards created since, with current statuses.
fn todo(state: &LocalState, index: &[TodoEntry]) -> Vec<TodoEntry> {
    let mut cards: Vec<TodoEntry> = index
        .iter()
        .map(|card| TodoEntry {
            status: state
                .statuses
                .get(&card.fingerprint)
                .copied()
                .unwrap_or(card.status),
            ..card.clone()
        })
        .collect();
    for manual in &state.manual_cards {
        if cards
            .iter()
            .any(|card| card.fingerprint == manual.fingerprint)
        {
            continue;
        }
        cards.push(TodoEntry {
            fingerprint: manual.fingerprint.clone(),
            fingerprints: vec![manual.fingerprint.clone()],
            short_id: manual.fingerprint.chars().take(8).collect(),
            title: manual.title.clone(),
            kind: manual.kind,
            status: state.status_for(&manual.fingerprint),
            project: manual.project.clone(),
        });
    }
    cards
}

fn find<'a>(cards: &'a [TodoEntry], id: &str) -> Option<&'a TodoEntry> {
    let id = id.trim();
    if id.is_empty() {
        return None;
    }
    cards.iter().find(|card| {
        card.short_id.eq_ignore_ascii_case(id)
            || card.fingerprint == id
            || card.fingerprints.iter().any(|fp| fp == id)
    })
}

/// Project named by the agent, else the watched folder holding its working directory,
/// else that directory's name. Only names are used; no folder is read.
fn project_for(
    state: &LocalState,
    requested: Option<&str>,
    cwd: Option<&Path>,
) -> Result<(String, bool), Value> {
    let watched_name = |name: &str| {
        state.watched_folders.iter().any(|root| {
            Path::new(root)
                .file_name()
                .is_some_and(|folder| folder.to_string_lossy().eq_ignore_ascii_case(name))
        })
    };
    if let Some(name) = requested.map(str::trim).filter(|name| !name.is_empty()) {
        if name.len() > 100 || name.contains(['\n', '\r']) {
            return Err(json!({ "code": -32602, "message": "Invalid project name" }));
        }
        return Ok((name.to_string(), !watched_name(name)));
    }
    let Some(cwd) = cwd else {
        return Err(json!({ "code": -32602, "message": "Pass project" }));
    };
    let cwd_text = cwd.to_string_lossy();
    if let Some(root) = state
        .watched_folders
        .iter()
        .filter(|root| is_within(root, &cwd_text))
        .max_by_key(|root| root.len())
        && let Some(name) = Path::new(root).file_name()
    {
        return Ok((name.to_string_lossy().into_owned(), false));
    }
    cwd.file_name()
        .map(|name| (name.to_string_lossy().into_owned(), true))
        .ok_or_else(|| json!({ "code": -32602, "message": "Pass project" }))
}

fn create(
    state: &mut LocalState,
    title: &str,
    kind: CardKind,
    project: &str,
    unwatched: bool,
) -> String {
    let fp = Fingerprint::new(kind, SourceKind::Comment, Some(project), title)
        .as_str()
        .to_string();
    // Asking twice for the same card does not duplicate it.
    if !state.manual_cards.iter().any(|card| card.fingerprint == fp) {
        state.manual_cards.push(ManualCard {
            fingerprint: fp.clone(),
            kind,
            title: title.to_string(),
            project: project.to_string(),
            branch: None,
            created_at: time::OffsetDateTime::now_utc().date().to_string(),
            unwatched,
        });
    }
    fp
}

fn move_card(
    state: &mut LocalState,
    index: &[TodoEntry],
    id: &str,
    status: CardStatus,
) -> Result<String, Value> {
    let cards = todo(state, index);
    let card = find(&cards, id).ok_or_else(not_found)?;
    let mut fingerprints = card.fingerprints.clone();
    if !fingerprints.contains(&card.fingerprint) {
        fingerprints.push(card.fingerprint.clone());
    }
    let title = card.title.clone();
    set_group_status(state, &fingerprints, status);
    Ok(title)
}

fn parse_status(value: &str) -> Option<CardStatus> {
    match value {
        "todo" | "new" | "pending" => Some(CardStatus::New),
        "in_progress" | "accepted" => Some(CardStatus::Accepted),
        "done" | "resolved" => Some(CardStatus::Done),
        "dismissed" => Some(CardStatus::Dismissed),
        _ => None,
    }
}

fn status_name(status: CardStatus) -> &'static str {
    match status {
        CardStatus::New => "todo",
        CardStatus::Accepted => "in_progress",
        CardStatus::Done => "done",
        CardStatus::Dismissed => "dismissed",
    }
}

fn card_json(card: &TodoEntry) -> Value {
    json!({
        "id": card.short_id,
        "fingerprint": card.fingerprint,
        "title": card.title,
        "kind": card.kind,
        "status": status_name(card.status),
        "project": card.project,
    })
}

fn not_found() -> Value {
    json!({ "code": -32602, "message": "No Wakeline To Do card with that id" })
}

fn storage_error(error: io::Error) -> Value {
    json!({ "code": -32000, "message": error.to_string() })
}

fn text_content(text: &str) -> Value {
    json!({
        "content": [{ "type": "text", "text": text }]
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn there_is_no_delete_tool() {
        assert!(TOOL_NAMES.iter().all(|name| !name.contains("delete")));
    }

    #[test]
    fn responds_to_initialize_and_tools_list() {
        let init = handle_line(r#"{"jsonrpc":"2.0","id":1,"method":"initialize"}"#).unwrap();
        assert!(init.error.is_none());
        let list = handle_line(r#"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#).unwrap();
        let tools: Vec<_> = list.result.unwrap()["tools"]
            .as_array()
            .unwrap()
            .iter()
            .map(|tool| tool["name"].as_str().unwrap().to_string())
            .collect();
        assert_eq!(tools, TOOL_NAMES);
    }

    #[test]
    fn modern_clients_can_discover_and_list_tools() {
        let metadata = r#""_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28"}"#;
        let discover = handle_line(&format!(
            r#"{{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{{{metadata}}}}}"#
        ))
        .unwrap();
        assert_eq!(
            discover.result.unwrap()["supportedVersions"][0],
            "2026-07-28"
        );
        let list = handle_line(&format!(
            r#"{{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{{{metadata}}}}}"#
        ))
        .unwrap();
        assert_eq!(list.result.unwrap()["resultType"], "complete");
    }

    #[test]
    fn project_comes_from_the_name_or_the_working_folder_without_watching() {
        let mut state = LocalState::default();
        state.watched_folders.push("C:/projects/alpha".into());
        assert_eq!(
            project_for(&state, Some("Contastack"), None).unwrap(),
            ("Contastack".into(), true)
        );
        assert_eq!(
            project_for(&state, Some("alpha"), None).unwrap(),
            ("alpha".into(), false)
        );
        let inside = Path::new("C:/projects/alpha/src");
        assert_eq!(
            project_for(&state, None, Some(inside)).unwrap(),
            ("alpha".into(), false)
        );
        let outside = Path::new("C:/elsewhere/wakeline");
        assert_eq!(
            project_for(&state, None, Some(outside)).unwrap(),
            ("wakeline".into(), true)
        );
        assert!(project_for(&state, None, None).is_err());
        assert!(project_for(&state, Some("a\nb"), None).is_err());
    }

    #[test]
    fn created_cards_are_listed_moved_and_never_duplicated() {
        let mut state = LocalState::default();
        let fp = create(
            &mut state,
            "Fix bug in wakeline",
            CardKind::Task,
            "wakeline",
            true,
        );
        assert_eq!(
            create(
                &mut state,
                "Fix bug in wakeline",
                CardKind::Task,
                "wakeline",
                true
            ),
            fp
        );
        assert_eq!(state.manual_cards.len(), 1);
        assert!(state.manual_cards[0].unwatched);

        let index = vec![TodoEntry {
            fingerprint: "scanned".into(),
            fingerprints: vec!["scanned".into(), "older".into()],
            short_id: "W-001".into(),
            title: "Repeated build error".into(),
            kind: CardKind::Error,
            status: CardStatus::New,
            project: "alpha".into(),
        }];
        let cards = todo(&state, &index);
        assert_eq!(cards.len(), 2);

        move_card(&mut state, &index, "w-001", CardStatus::Accepted).unwrap();
        assert_eq!(state.status_for("scanned"), CardStatus::Accepted);
        assert_eq!(state.status_for("older"), CardStatus::Accepted);
        move_card(&mut state, &index, &fp, CardStatus::Done).unwrap();
        assert_eq!(todo(&state, &index)[1].status, CardStatus::Done);
        assert!(move_card(&mut state, &index, "W-999", CardStatus::Done).is_err());
        assert_eq!(parse_status("in_progress"), Some(CardStatus::Accepted));
        assert_eq!(parse_status("review"), None);
    }
}
