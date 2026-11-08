//! Servidor MCP de Wakeline por stdio (JSON-RPC 2.0).
//!
//! Permite que el agente de IA consulte el backlog y cierre tarjetas desde el chat.
//! Nunca borra: no existe una herramienta de borrado.

use std::io::{self, BufRead, Write};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use wakeline_core::store::{LocalState, ManualCard};
use wakeline_core::{CardKind, CardStatus, Fingerprint, SourceKind};

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
    let result = match req.method.as_str() {
        "initialize" => Ok(json!({
            "protocolVersion": "2024-11-05",
            "capabilities": { "tools": {} },
            "serverInfo": { "name": "wakeline", "version": env!("CARGO_PKG_VERSION") }
        })),
        "tools/list" => Ok(tools_list()),
        "tools/call" => call_tool(&req.params),
        _ => Err(json!({ "code": -32601, "message": "Método no soportado" })),
    };
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
                "description": "Lista las tarjetas abiertas guardadas en Wakeline.",
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
                "description": "Crea una tarjeta nueva en el backlog de Wakeline.",
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
            let text = serde_json::to_string_pretty(&state.manual_cards).unwrap_or_default();
            Ok(text_content(&text))
        }
        "get_card" => {
            let fp = args["fingerprint"].as_str().unwrap_or_default();
            let status = state.status_for(fp);
            let card = state.manual_cards.iter().find(|c| c.fingerprint == fp);
            Ok(text_content(
                &json!({ "fingerprint": fp, "status": status, "card": card }).to_string(),
            ))
        }
        "create_card" => {
            let title = args["title"].as_str().unwrap_or_default().trim();
            if title.is_empty() {
                return Err(json!({ "code": -32602, "message": "Falta title" }));
            }
            let project = args["project"].as_str().unwrap_or("Contastack").to_string();
            let kind = match args["kind"].as_str() {
                Some("error") => CardKind::Error,
                Some("idea") => CardKind::Idea,
                _ => CardKind::Task,
            };
            let fp = Fingerprint::new(kind, SourceKind::Comment, Some(&project), title)
                .as_str()
                .to_string();
            state.manual_cards.push(ManualCard {
                fingerprint: fp.clone(),
                kind,
                title: title.to_string(),
                project,
                branch: Some("main".into()),
                created_at: "2026-11-08".into(),
            });
            let _ = state.save(&path);
            Ok(text_content(&format!("Creada tarjeta {fp}")))
        }
        "complete_card" => {
            let fp = args["fingerprint"].as_str().unwrap_or_default().to_string();
            if fp.is_empty() {
                return Err(json!({ "code": -32602, "message": "Falta fingerprint" }));
            }
            state.set_status(fp.clone(), CardStatus::Done);
            let _ = state.save(&path);
            Ok(text_content(&format!("Tarjeta {fp} marcada como hecha")))
        }
        _ => Err(json!({ "code": -32601, "message": "Herramienta no existente" })),
    }
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
}
