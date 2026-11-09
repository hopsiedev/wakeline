//! Cuenta y conexiones. Wakeline no tiene inicio de sesión propio: la identidad sale
//! de la sesión de `gh` que el usuario ya tiene, en solo lectura. Lo usan la app de
//! escritorio y la CLI.

use std::net::{SocketAddr, TcpStream};
use std::path::Path;
use std::process::Command;
use std::time::Duration;

use serde::{Deserialize, Serialize};

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
    pub ollama: bool,
    pub version: String,
}

pub fn read_account(home: &Path, version: String) -> AccountInfo {
    AccountInfo {
        github: github_user(),
        claude_code: home.join(".claude").join("projects").is_dir(),
        ollama: ollama_running(),
        version,
    }
}

/// Pide el usuario a la API de GitHub con la sesión de `gh`.
fn github_user() -> Option<GithubUser> {
    let mut command = Command::new("gh");
    command.args(["api", "user"]);
    hide_console(&mut command);
    let output = command.output().ok()?;
    if !output.status.success() {
        return None;
    }
    parse_github_user(&output.stdout)
}

fn parse_github_user(json: &[u8]) -> Option<GithubUser> {
    serde_json::from_slice(json).ok()
}

/// Ollama escucha en el puerto 11434 cuando está abierto.
fn ollama_running() -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], 11434));
    TcpStream::connect_timeout(&address, Duration::from_millis(300)).is_ok()
}

/// En Windows, evita que se abra una ventana de consola al lanzar `gh`.
fn hide_console(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    let _ = command;
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
}
