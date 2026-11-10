//! Último resultado de cada comando, en `%APPDATA%\wakeline\commands.json`.
//!
//! Es una caché que se puede regenerar volviendo a ejecutar los comandos; las decisiones
//! del usuario siguen en `state.json`. Va en un archivo aparte para que la ejecución en
//! segundo plano no compita con los guardados de `state.json`.

use std::collections::HashMap;
use std::io;
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::CommandSpec;
use super::exec::RunOutput;
use super::parsers::{self, ParsedError};
use crate::card::{CardKind, SourceKind};
use crate::fingerprint::Fingerprint;
use crate::redact::redact;
use crate::store::LocalState;
use crate::watch::normalized_path;

const EVIDENCE_LINES: usize = 30;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunStatus {
    Passed,
    Failed,
    /// Agotó `timeout_secs`; no dice nada de los errores (Q54).
    TimedOut,
    /// No se pudo lanzar (programa no encontrado, carpeta inexistente).
    NotStarted,
}

/// Una tarjeta de Error salida de un comando.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CommandCard {
    pub fingerprint: Fingerprint,
    pub kind: CardKind,
    pub title: String,
    /// Ruta relativa al proyecto con `/`.
    pub path: Option<String>,
    pub line: Option<usize>,
    pub occurrences: u32,
    /// Últimas líneas de la salida, solo en tarjetas `raw`.
    pub evidence: Option<String>,
}

impl CommandCard {
    pub fn location(&self) -> Option<String> {
        let path = self.path.as_ref()?;
        Some(match self.line {
            Some(line) => format!("{path}:{line}"),
            None => path.clone(),
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CommandResult {
    /// Carpeta del proyecto tal como se vigila.
    pub project: String,
    pub command: String,
    pub status: RunStatus,
    /// Segundos Unix al terminar.
    pub finished_at: u64,
    /// Código de salida o motivo por el que no se lanzó.
    pub detail: Option<String>,
    pub cards: Vec<CommandCard>,
}

/// Convierte la salida de un comando en su resultado con tarjetas.
pub fn evaluate(
    project_root: &Path,
    spec: &CommandSpec,
    outcome: io::Result<RunOutput>,
    finished_at: u64,
) -> CommandResult {
    let mut result = CommandResult {
        project: project_root.display().to_string(),
        command: spec.name.clone(),
        status: RunStatus::Passed,
        finished_at,
        detail: None,
        cards: Vec::new(),
    };
    let output = match outcome {
        Ok(output) => output,
        Err(error) => {
            result.status = RunStatus::NotStarted;
            result.detail = Some(error.to_string());
            return result;
        }
    };
    if output.timed_out {
        result.status = RunStatus::TimedOut;
        result.detail = Some(format!("superó {} s", spec.timeout_secs));
        return result;
    }
    if output.success {
        return result;
    }

    result.status = RunStatus::Failed;
    result.detail = output.exit_code.map(|code| format!("código {code}"));
    let combined = format!("{}\n{}", output.stdout, output.stderr);
    let errors = parsers::parse(spec.parser, &combined);
    if errors.is_empty() {
        result.cards.push(raw_card(spec, &combined));
    } else {
        let cwd = spec.cwd.as_deref().unwrap_or("");
        for error in errors {
            push_card(&mut result.cards, project_root, cwd, error);
        }
    }
    result
}

fn push_card(cards: &mut Vec<CommandCard>, project_root: &Path, cwd: &str, error: ParsedError) {
    let path = error
        .path
        .as_deref()
        .map(|p| project_relative(project_root, cwd, p));
    let title = redact(&error.message);
    let fingerprint = Fingerprint::new(
        CardKind::Error,
        SourceKind::Command,
        path.as_deref(),
        &title,
    );
    if let Some(card) = cards.iter_mut().find(|c| c.fingerprint == fingerprint) {
        card.occurrences += 1;
        return;
    }
    cards.push(CommandCard {
        fingerprint,
        kind: CardKind::Error,
        title,
        path,
        line: error.line,
        occurrences: 1,
        evidence: None,
    });
}

fn raw_card(spec: &CommandSpec, output: &str) -> CommandCard {
    let title = format!("{} falló", spec.name);
    let lines: Vec<&str> = output.lines().filter(|l| !l.trim().is_empty()).collect();
    let tail = lines[lines.len().saturating_sub(EVIDENCE_LINES)..].join("\n");
    CommandCard {
        fingerprint: Fingerprint::new(CardKind::Error, SourceKind::Command, None, &title),
        kind: CardKind::Error,
        title,
        path: None,
        line: None,
        occurrences: 1,
        evidence: (!tail.is_empty()).then(|| redact(&tail)),
    }
}

/// Ruta de la herramienta → relativa al proyecto con `/`.
fn project_relative(project_root: &Path, cwd: &str, tool_path: &str) -> String {
    let tool_path = tool_path.replace('\\', "/");
    let root = normalized_path(&project_root.to_string_lossy());
    let absolute = Path::new(&tool_path).is_absolute() || tool_path.starts_with('/');
    if absolute {
        let normalized = normalized_path(&tool_path);
        if let Some(rest) = normalized.strip_prefix(&format!("{root}/")) {
            // Se conserva la grafía original del tramo relativo.
            return tool_path
                .get(tool_path.len().saturating_sub(rest.len())..)
                .filter(|tail| tail.eq_ignore_ascii_case(rest))
                .unwrap_or(rest)
                .to_string();
        }
        return tool_path;
    }
    lexical_join(cwd, &tool_path)
}

fn lexical_join(base: &str, relative: &str) -> String {
    let mut parts: Vec<String> = Vec::new();
    for component in Path::new(base).join(relative).components() {
        match component {
            Component::Normal(part) => parts.push(part.to_string_lossy().into_owned()),
            Component::ParentDir => {
                parts.pop();
            }
            _ => {}
        }
    }
    parts.join("/")
}

/// Archivo de resultados junto a `state.json`.
pub fn results_path() -> PathBuf {
    LocalState::default_path().with_file_name("commands.json")
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct CommandResults {
    #[serde(default)]
    results: HashMap<String, CommandResult>,
}

impl CommandResults {
    pub fn load(path: &Path) -> Self {
        std::fs::read_to_string(path)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default()
    }

    /// Escribe en un temporal y renombra, para no dejar el archivo a medias.
    pub fn save(&self, path: &Path) -> io::Result<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(self).map_err(io::Error::other)?;
        let temp = path.with_extension("json.tmp");
        std::fs::write(&temp, json)?;
        std::fs::rename(&temp, path)
    }

    /// Guarda el resultado. Un timeout o un fallo al lanzar no borra las tarjetas que
    /// había: no dicen nada de si los errores siguen ahí (Q54).
    pub fn record(&mut self, mut result: CommandResult) {
        let key = key(&result.project, &result.command);
        if matches!(result.status, RunStatus::TimedOut | RunStatus::NotStarted)
            && let Some(previous) = self.results.get(&key)
        {
            result.cards = previous.cards.clone();
        }
        self.results.insert(key, result);
    }

    pub fn get(&self, project_root: &Path, command: &str) -> Option<&CommandResult> {
        self.results
            .get(&key(&project_root.to_string_lossy(), command))
    }

    /// Resultados de un proyecto, ordenados por nombre de comando.
    pub fn for_project(&self, project_root: &Path) -> Vec<&CommandResult> {
        let root = normalized_path(&project_root.to_string_lossy());
        let mut found: Vec<_> = self
            .results
            .values()
            .filter(|r| normalized_path(&r.project) == root)
            .collect();
        found.sort_by(|a, b| a.command.cmp(&b.command));
        found
    }
}

fn key(project: &str, command: &str) -> String {
    format!("{}\u{1f}{command}", normalized_path(project))
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;
    use crate::commands::{ParserKind, Trigger};

    fn spec(parser: ParserKind, cwd: Option<&str>) -> CommandSpec {
        CommandSpec {
            name: "tsc".into(),
            run: vec!["npx".into(), "tsc".into()],
            cwd: cwd.map(Into::into),
            on: Trigger::Idle,
            parser,
            timeout_secs: 60,
        }
    }

    fn failed(stdout: &str) -> io::Result<RunOutput> {
        Ok(RunOutput {
            success: false,
            exit_code: Some(2),
            timed_out: false,
            stdout: stdout.into(),
            stderr: String::new(),
            duration: Duration::from_secs(1),
        })
    }

    #[test]
    fn failing_tsc_gives_one_error_card_per_error_relative_to_the_project() {
        let root = Path::new(r"C:\p");
        let out = "src/a.ts(3,7): error TS2304: Cannot find name 'x'.\n\
                   ../../crates/b.ts(1,1): error TS1005: ';' expected.\n";
        let result = evaluate(
            root,
            &spec(ParserKind::Tsc, Some("apps/desktop")),
            failed(out),
            1,
        );
        assert_eq!(result.status, RunStatus::Failed);
        assert_eq!(result.cards.len(), 2);
        assert_eq!(result.cards[0].kind, CardKind::Error);
        assert_eq!(
            result.cards[0].location().as_deref(),
            Some("apps/desktop/src/a.ts:3")
        );
        assert_eq!(result.cards[1].path.as_deref(), Some("crates/b.ts"));
    }

    #[test]
    #[cfg(windows)]
    fn absolute_tool_paths_become_project_relative() {
        assert_eq!(
            project_relative(Path::new(r"C:\Users\U\p"), "", r"c:\users\u\p\src\A.ts"),
            "src/A.ts"
        );
    }

    #[test]
    #[cfg(unix)]
    fn absolute_tool_paths_become_project_relative() {
        assert_eq!(
            project_relative(Path::new("/home/u/p"), "", "/home/u/p/src/A.ts"),
            "src/A.ts"
        );
        assert_eq!(
            project_relative(Path::new("/home/u/p"), "", "/home/u/P/src/A.ts"),
            "/home/u/P/src/A.ts"
        );
    }

    #[test]
    fn unparsed_failure_gives_a_single_raw_card_with_evidence() {
        let result = evaluate(
            Path::new("C:/p"),
            &spec(ParserKind::Raw, None),
            failed("boom\n"),
            1,
        );
        assert_eq!(result.cards.len(), 1);
        assert_eq!(result.cards[0].title, "tsc falló");
        assert_eq!(result.cards[0].evidence.as_deref(), Some("boom"));
    }

    #[test]
    fn passing_command_has_no_cards() {
        let ok = Ok(RunOutput {
            success: true,
            exit_code: Some(0),
            timed_out: false,
            stdout: String::new(),
            stderr: String::new(),
            duration: Duration::ZERO,
        });
        let result = evaluate(Path::new("C:/p"), &spec(ParserKind::Tsc, None), ok, 1);
        assert_eq!(result.status, RunStatus::Passed);
        assert!(result.cards.is_empty());
    }

    #[test]
    fn timeout_keeps_previous_cards_and_a_pass_clears_them() {
        let root = Path::new("C:/p");
        let mut results = CommandResults::default();
        let out = "src/a.ts(3,7): error TS2304: x\n";
        results.record(evaluate(root, &spec(ParserKind::Tsc, None), failed(out), 1));
        assert_eq!(results.get(root, "tsc").unwrap().cards.len(), 1);

        let timeout = Ok(RunOutput {
            success: false,
            exit_code: None,
            timed_out: true,
            stdout: String::new(),
            stderr: String::new(),
            duration: Duration::from_secs(60),
        });
        results.record(evaluate(root, &spec(ParserKind::Tsc, None), timeout, 2));
        let kept = results.get(root, "tsc").unwrap();
        assert_eq!(kept.status, RunStatus::TimedOut);
        assert_eq!(kept.cards.len(), 1);

        let pass = Ok(RunOutput {
            success: true,
            exit_code: Some(0),
            timed_out: false,
            stdout: String::new(),
            stderr: String::new(),
            duration: Duration::ZERO,
        });
        results.record(evaluate(root, &spec(ParserKind::Tsc, None), pass, 3));
        assert!(results.get(root, "tsc").unwrap().cards.is_empty());
    }

    #[test]
    fn results_round_trip_on_disk() {
        let path =
            std::env::temp_dir().join(format!("wakeline-results-{}.json", std::process::id()));
        let mut results = CommandResults::default();
        results.record(evaluate(
            Path::new("C:/p"),
            &spec(ParserKind::Raw, None),
            failed("x"),
            1,
        ));
        results.save(&path).unwrap();
        assert_eq!(CommandResults::load(&path), results);
        let _ = std::fs::remove_file(&path);
    }
}
