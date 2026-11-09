//! Servidor MCP de Wakeline por stdio (JSON-RPC 2.0).
//!
//! Permite que el agente de IA consulte el backlog y cierre tarjetas desde el chat.
//! Nunca borra: no existe una herramienta de borrado.

use std::io::{self, BufRead, Write};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use wakeline_core::redact::redact;
use wakeline_core::store::{LocalState, ManualCard};
use wakeline_core::{CardKind, CardStatus, Fingerprint, SourceKind};

mod cards;

/// Herramientas expuestas por el servidor MCP, en este orden.
pub const TOOL_NAMES: [&str; 4] = ["list_cards", "get_card", "create_card", "complete_card"];

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
    json!({
        "tools": [
            {
                "name": "list_cards",
                "description": "Lista los hallazgos abiertos de las carpetas vigiladas en Wakeline.",
                "inputSchema": { "type": "object", "properties": {} }
            },
            {
                "name": "get_card",
                "description": "Obtiene una tarjeta por su huella (fingerprint).",
                "inputSchema": {
                    "type": "object",
                    "properties": { "fingerprint": { "type": "string" } },
                    "required": ["fingerprint"]
                }
            },
            {
                "name": "create_card",
                "description": "Crea una tarjeta en una carpeta vigilada de Wakeline.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "title": { "type": "string" },
                        "project": { "type": "string" },
                        "kind": { "type": "string", "enum": ["error", "task", "idea"] }
                    },
                    "required": ["title"]
                }
            },
            {
                "name": "complete_card",
                "description": "Marca una tarjeta como hecha (done) sin borrarla.",
                "inputSchema": {
                    "type": "object",
                    "properties": { "fingerprint": { "type": "string" } },
                    "required": ["fingerprint"]
                }
            }
        ]
    })
}

fn call_tool(params: &Value) -> Result<Value, Value> {
    let name = params["name"].as_str().unwrap_or_default();
    let args = &params["arguments"];
    let path = LocalState::default_path();
    let mut state = LocalState::load(&path);

    match name {
        "list_cards" => {
            let text = serde_json::to_string_pretty(&cards::open_cards(cards::scan_cards(&state)))
                .unwrap_or_default();
            Ok(text_content(&text))
        }
        "get_card" => {
            let fp = args["fingerprint"].as_str().unwrap_or_default();
            let card = cards::scan_cards(&state)
                .into_iter()
                .find(|card| card["fingerprint"] == fp);
            Ok(text_content(&card.unwrap_or(Value::Null).to_string()))
        }
        "create_card" => {
            let title = args["title"].as_str().unwrap_or_default().trim();
            if title.is_empty() {
                return Err(json!({ "code": -32602, "message": "Falta title" }));
            }
            let project = selected_project(&state, args["project"].as_str())?;
            let kind = match args["kind"].as_str() {
                Some("error") => CardKind::Error,
                Some("idea") => CardKind::Idea,
                _ => CardKind::Task,
            };
            let title = redact(title);
            let fp = Fingerprint::new(kind, SourceKind::Comment, Some(&project), &title)
                .as_str()
                .to_string();
            state.manual_cards.push(ManualCard {
                fingerprint: fp.clone(),
                kind,
                title,
                project,
                branch: None,
                created_at: time::OffsetDateTime::now_utc().date().to_string(),
            });
            state.save(&path).map_err(storage_error)?;
            Ok(text_content(&format!("Creada tarjeta {fp}")))
        }
        "complete_card" => {
            let fp = args["fingerprint"].as_str().unwrap_or_default().to_string();
            if fp.is_empty() {
                return Err(json!({ "code": -32602, "message": "Falta fingerprint" }));
            }
            state.set_status(fp.clone(), CardStatus::Done);
            state.save(&path).map_err(storage_error)?;
            Ok(text_content(&format!("Tarjeta {fp} marcada como hecha")))
        }
        _ => Err(json!({ "code": -32601, "message": "Herramienta no existente" })),
    }
}

fn selected_project(state: &LocalState, requested: Option<&str>) -> Result<String, Value> {
    let names: Vec<String> = state
        .watched_folders
        .iter()
        .filter_map(|path| std::path::Path::new(path).file_name())
        .map(|name| name.to_string_lossy().into_owned())
        .collect();
    match requested {
        Some(name) if names.iter().any(|known| known == name) => Ok(name.to_string()),
        Some(_) => Err(json!({ "code": -32602, "message": "El proyecto no está vigilado" })),
        None if names.len() == 1 => Ok(names[0].clone()),
        None => Err(json!({ "code": -32602, "message": "Indica project de una carpeta vigilada" })),
    }
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
        let tools = list.result.unwrap()["tools"].as_array().unwrap().len();
        assert_eq!(tools, 4);
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
    fn create_card_requires_a_watched_project() {
        let mut state = LocalState::default();
        assert!(selected_project(&state, None).is_err());
        state.watched_folders.push("C:/projects/alpha".into());
        assert_eq!(selected_project(&state, None).unwrap(), "alpha");
        assert!(selected_project(&state, Some("Contastack")).is_err());
    }
}
