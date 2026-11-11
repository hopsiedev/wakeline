//! Cuenta y conexiones. Wakeline no tiene inicio de sesión propio: la identidad sale
//! de la sesión de `gh` que el usuario ya tiene, en solo lectura. Lo usan la app de
//! escritorio y la CLI.

use std::net::{SocketAddr, TcpStream};
use std::path::Path;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::store::LocalState;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GithubUser {
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AccountInfo {
    /// `None` si `gh` no está instalado o no tiene sesión.
    pub github: Option<GithubUser>,
    pub claude_code: bool,
    pub codex_mcp: bool,
    pub antigravity_mcp: bool,
    pub ollama: bool,
    pub version: String,
}

pub fn read_account(home: &Path, version: String) -> AccountInfo {
    let codex_home = std::env::var_os("CODEX_HOME")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| home.join(".codex"));
    let watched_folders = LocalState::load(&LocalState::default_path()).watched_folders;
    let antigravity_configured = [
        home.join(".gemini").join("config").join("mcp_config.json"),
        home.join(".gemini")
            .join("antigravity")
            .join("mcp_config.json"),
    ]
    .into_iter()
    .chain(
        watched_folders
            .iter()
            .map(|folder| Path::new(folder).join(".agents").join("mcp_config.json")),
    )
    .any(|path| {
        std::fs::read_to_string(path)
            .ok()
            .is_some_and(|config| antigravity_mcp_configured(&config))
    });
    AccountInfo {
        github: github_user(),
        claude_code: home.join(".claude").join("projects").is_dir(),
        codex_mcp: std::fs::read_to_string(codex_home.join("config.toml"))
            .ok()
            .is_some_and(|config| codex_mcp_configured(&config)),
        antigravity_mcp: antigravity_configured,
        ollama: ollama_running(),
        version,
    }
}

fn codex_mcp_configured(config: &str) -> bool {
    toml::from_str::<toml::Value>(config)
        .ok()
        .and_then(|value| value.get("mcp_servers")?.get("wakeline").cloned())
        .is_some_and(|server| {
            server
                .get("command")
                .and_then(toml::Value::as_str)
                .is_some()
                && server.get("enabled").and_then(toml::Value::as_bool) != Some(false)
        })
}

fn antigravity_mcp_configured(config: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(config)
        .ok()
        .and_then(|value| value.get("mcpServers")?.get("wakeline").cloned())
        .is_some_and(|server| {
            server
                .get("command")
                .and_then(serde_json::Value::as_str)
                .is_some()
                && server.get("disabled").and_then(serde_json::Value::as_bool) != Some(true)
        })
}

/// Pide el usuario a la API de GitHub con la sesión de `gh`.
fn github_user() -> Option<GithubUser> {
    use crate::github::{GhClient, SystemGh};
    let output = SystemGh.run(&["api", "user"]).ok()?;
    parse_github_user(output.as_bytes())
}

fn parse_github_user(json: &[u8]) -> Option<GithubUser> {
    serde_json::from_slice(json).ok()
}

/// Ollama escucha en el puerto 11434 cuando está abierto.
fn ollama_running() -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], 11434));
    TcpStream::connect_timeout(&address, Duration::from_millis(300)).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_the_github_user_and_ignores_other_fields() {
        let json = br#"{"login":"hopsiedev","name":null,"avatar_url":"https://avatars.githubusercontent.com/u/1","id":1,"plan":{}}"#;
        assert_eq!(
            parse_github_user(json),
            Some(GithubUser {
                login: "hopsiedev".into(),
                name: None,
                avatar_url: "https://avatars.githubusercontent.com/u/1".into(),
            })
        );
    }

    #[test]
    fn invalid_output_means_no_account() {
        assert_eq!(parse_github_user(b"gh: not logged in"), None);
    }

    #[test]
    fn detects_configured_mcp_clients() {
        assert!(codex_mcp_configured(
            "[mcp_servers.wakeline]\ncommand = 'wakeline'\nargs = ['mcp']"
        ));
        assert!(!codex_mcp_configured(
            "[mcp_servers.wakeline]\ncommand = 'wakeline'\nenabled = false"
        ));
        assert!(antigravity_mcp_configured(
            r#"{"mcpServers":{"wakeline":{"command":"wakeline","args":["mcp"]}}}"#
        ));
        assert!(!antigravity_mcp_configured(
            r#"{"mcpServers":{"wakeline":{"command":"wakeline","disabled":true}}}"#
        ));
    }
}
