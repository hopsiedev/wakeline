//! Lector de sesiones de Claude Code (`~/.claude/projects/**/*.jsonl`).
//!
//! - Lee en streaming desde el último offset: nunca carga un archivo entero.
//! - Solo descodifica las líneas que importan (respuestas finales y errores de
//!   herramientas); el resto se salta con una búsqueda de texto barata.
//! - Una línea a medio escribir (sin `\n`) no se consume: se leerá la próxima vez.

use std::collections::HashMap;
use std::fs::File;
use std::io::{self, BufRead, BufReader, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use serde::Deserialize;
use serde_json::Value;

/// Un archivo de sesión encontrado en disco.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionFile {
    pub path: PathBuf,
    pub is_subagent: bool,
}

/// Lee solo hasta el primer cwd declarado, sin deducirlo del nombre de la carpeta.
pub fn session_cwd(path: &Path) -> io::Result<Option<String>> {
    if crate::exclusions::is_excluded(path) {
        return Ok(None);
    }
    #[derive(Deserialize)]
    struct Metadata {
        cwd: Option<String>,
    }
    let mut reader = BufReader::new(File::open(path)?);
    let mut line = String::new();
    loop {
        line.clear();
        if reader.read_line(&mut line)? == 0 {
            return Ok(None);
        }
        if line.contains("\"cwd\"")
            && let Ok(metadata) = serde_json::from_str::<Metadata>(&line)
            && let Some(cwd) = metadata.cwd.filter(|cwd| !cwd.is_empty())
        {
            return Ok(Some(cwd));
        }
    }
}

pub fn belongs_to_watched(file: &SessionFile, roots: &[String]) -> io::Result<bool> {
    let parent = file
        .path
        .parent()
        .and_then(Path::parent)
        .map(|session| session.with_extension("jsonl"))
        .filter(|path| file.is_subagent && path.is_file());
    let parent_cwd = match parent {
        Some(parent) => session_cwd(&parent)?,
        None => None,
    };
    let cwd = match parent_cwd {
        Some(cwd) => Some(cwd),
        None => session_cwd(&file.path)?,
    };
    Ok(cwd.is_some_and(|cwd| roots.iter().any(|root| crate::watch::is_within(root, &cwd))))
}

/// Lo que interesa de una línea de sesión.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionEvent {
    pub session_id: String,
    pub timestamp: Option<String>,
    pub cwd: Option<String>,
    pub git_branch: Option<String>,
    pub kind: EventKind,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EventKind {
    /// Texto con el que la IA cerró un turno (`stop_reason: end_turn`).
    FinalText(String),
    /// Un comando que falló (`tool_result` con `is_error`).
    ToolError {
        tool: Option<String>,
        message: String,
        output: String,
    },
}

/// Resultado de leer un archivo desde un offset.
#[derive(Debug, Default)]
pub struct ReadResult {
    /// Offset hasta el que se leyó; se pasa en la próxima lectura.
    pub offset: u64,
    pub events: Vec<SessionEvent>,
    /// Líneas que no eran JSON válido (se saltan, no detienen la lectura).
    pub bad_lines: usize,
}

/// Herramientas cuyos errores son fallos del proyecto (no del uso de la herramienta).
const COMMAND_TOOLS: &[&str] = &["Bash", "PowerShell"];

/// Errores que no son fallos del proyecto: rechazos del usuario, interrupciones del
/// arnés o errores internos del propio agente al invocar la shell.
const NOT_REAL_ERRORS: &[&str] = &[
    "doesn't want to proceed",
    "user rejected",
    "request interrupted",
    "tool permission request aborted",
    "[tool call interrupted:",
    "was blocked by",
    "permission to use",
    "is temporarily unavailable",
    "auto mode cannot determine",
    "no tiene un turno vivo",
    "unexpected eof while looking for matching",
    "syntax error: unexpected end of file",
    "rtk: command not found",
];

/// Busca los archivos de sesión bajo `~/.claude/projects` (o la raíz dada).
pub fn discover(projects_root: &Path) -> io::Result<Vec<SessionFile>> {
    let mut files = Vec::new();
    for project in read_dir_sorted(projects_root)? {
        if !project.is_dir() || crate::exclusions::is_excluded(&project) {
            continue;
        }
        for entry in read_dir_sorted(&project)? {
            if is_jsonl(&entry) {
                files.push(SessionFile {
                    path: entry,
                    is_subagent: false,
                });
            } else if entry.is_dir() {
                let subagents = entry.join("subagents");
                if subagents.is_dir() {
                    for sub in read_dir_sorted(&subagents)? {
                        if is_jsonl(&sub) {
                            files.push(SessionFile {
                                path: sub,
                                is_subagent: true,
                            });
                        }
                    }
                }
            }
        }
    }
    files.retain(|f| !crate::exclusions::is_excluded(&f.path));
    Ok(files)
}

/// Lee un archivo de sesión desde `offset`. Si el archivo se hizo más pequeño que el
/// offset (se reescribió), se vuelve a leer desde el principio.
pub fn read_from(path: &Path, offset: u64) -> io::Result<ReadResult> {
    let mut file = File::open(path)?;
    let len = file.metadata()?.len();
    let start = if offset > len { 0 } else { offset };
    file.seek(SeekFrom::Start(start))?;

    let mut reader = BufReader::with_capacity(1 << 20, file);
    let mut result = ReadResult {
        offset: start,
        ..Default::default()
    };
    let mut line = String::new();
    let mut tool_names: HashMap<String, String> = HashMap::new();

    loop {
        line.clear();
        let read = reader.read_line(&mut line)?;
        if read == 0 || !line.ends_with('\n') {
            break; // fin o línea a medio escribir
        }
        result.offset += read as u64;
        match parse_line(&line, &mut tool_names) {
            Ok(Some(event)) => result.events.push(event),
            Ok(None) => {}
            Err(_) => result.bad_lines += 1,
        }
    }
    Ok(result)
}

#[derive(Deserialize)]
struct RawLine {
    #[serde(rename = "type")]
    kind: String,
    #[serde(rename = "sessionId", default)]
    session_id: String,
    #[serde(default)]
    timestamp: Option<String>,
    #[serde(default)]
    cwd: Option<String>,
    #[serde(rename = "gitBranch", default)]
    git_branch: Option<String>,
    #[serde(rename = "isMeta", default)]
    is_meta: bool,
    #[serde(default)]
    message: Option<RawMessage>,
}

#[derive(Deserialize)]
struct RawMessage {
    #[serde(default)]
    stop_reason: Option<String>,
    #[serde(default)]
    content: Value,
}

fn parse_line(
    line: &str,
    tool_names: &mut HashMap<String, String>,
) -> serde_json::Result<Option<SessionEvent>> {
    // Filtro barato antes de descodificar: la mayoría de líneas no interesan.
    let is_assistant = line.contains("\"type\":\"assistant\"");
    let has_error = line.contains("\"is_error\":true");
    if !is_assistant && !has_error {
        return Ok(None);
    }

    let raw: RawLine = serde_json::from_str(line)?;
    if raw.is_meta {
        return Ok(None);
    }
    let Some(message) = raw.message else {
        return Ok(None);
    };
    let blocks = message
        .content
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default();

    let kind = match raw.kind.as_str() {
        "assistant" => {
            for block in blocks {
                if block["type"] == "tool_use"
                    && let (Some(id), Some(name)) = (block["id"].as_str(), block["name"].as_str())
                {
                    tool_names.insert(id.to_string(), name.to_string());
                }
            }
            if message.stop_reason.as_deref() != Some("end_turn") {
                return Ok(None);
            }
            let text: Vec<&str> = blocks
                .iter()
                .filter(|b| b["type"] == "text")
                .filter_map(|b| b["text"].as_str())
                .collect();
            if text.is_empty() {
                return Ok(None);
            }
            EventKind::FinalText(text.join("\n"))
        }
        "user" => {
            let Some(block) = blocks
                .iter()
                .find(|b| b["type"] == "tool_result" && b["is_error"] == true)
            else {
                return Ok(None);
            };
            let tool = block["tool_use_id"]
                .as_str()
                .and_then(|id| tool_names.get(id).cloned());
            if tool.as_deref().is_some_and(|t| !COMMAND_TOOLS.contains(&t)) {
                return Ok(None);
            }
            let Some((message, output)) = error_message(&block["content"]) else {
                return Ok(None);
            };
            EventKind::ToolError {
                tool,
                message,
                output,
            }
        }
        _ => return Ok(None),
    };

    Ok(Some(SessionEvent {
        session_id: raw.session_id,
        timestamp: raw.timestamp,
        cwd: raw.cwd,
        git_branch: clean_branch(raw.git_branch),
        kind,
    }))
}

fn clean_branch(branch: Option<String>) -> Option<String> {
    let branch = branch?;
    let trimmed = branch.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("HEAD") {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// La línea más útil de un error: prioriza cabeceras de excepción o compilador
/// (`error TS...`, `error[E...]`, `TypeError:`, `error:`) antes que líneas de código
/// dentro de un traceback. Si la salida no parece un error real (por ejemplo, `grep`
/// con código de salida 1), devuelve `None`.
fn error_message(content: &Value) -> Option<(String, String)> {
    let text = match content {
        Value::String(s) => s.clone(),
        Value::Array(parts) => parts
            .iter()
            .filter_map(|p| p["text"].as_str())
            .collect::<Vec<_>>()
            .join("\n"),
        _ => return None,
    };
    let lower = text.to_lowercase();
    if NOT_REAL_ERRORS.iter().any(|p| lower.contains(p)) {
        return None;
    }
    let lines: Vec<&str> = text
        .lines()
        .map(|l| {
            l.trim()
                .trim_start_matches("<tool_use_error>")
                .trim_end_matches("</tool_use_error>")
                .trim()
        })
        .filter(|l| {
            !l.is_empty()
                && !l.starts_with("Exit code")
                && !l.starts_with('>')
                && !l.starts_with("Traceback ")
                && !l.starts_with("File \"")
                && !l.starts_with("+ ")
                && !l.starts_with("At line:")
                && !l.contains("\"/tmp/")
                && !l.contains("'/tmp/")
        })
        .collect();
    let best = lines
        .iter()
        .copied()
        .find(|l| is_strong_error_line(l))
        .or_else(|| {
            lines.iter().copied().find(|l| {
                let ll = l.to_lowercase();
                (has_error_word(&ll) && !ll.contains(".errors"))
                    || ll.contains("failed")
                    || ll.contains("falló")
                    || ll.contains("command not found")
            })
        })?;
    // Keep the lines around the actual failure, including nearby source context.
    // Command output can be very long and contain unrelated data.
    let source_lines: Vec<&str> = text.lines().collect();
    let position = source_lines
        .iter()
        .position(|line| line.contains(best))
        .unwrap_or(0);
    let start = position.saturating_sub(2);
    let end = (position + 6).min(source_lines.len());
    let output: String = source_lines[start..end]
        .join("\n")
        .chars()
        .take(1500)
        .collect();
    Some((best.chars().take(240).collect(), output))
}

/// Comprueba que aparezca la palabra `error` (no dentro de otra palabra como «Terror»).
fn has_error_word(lower: &str) -> bool {
    for (idx, _) in lower.match_indices("error") {
        let prev = lower[..idx].chars().next_back();
        if !prev.is_some_and(|c| c.is_alphabetic()) {
            return true;
        }
    }
    false
}

fn is_strong_error_line(line: &str) -> bool {
    let lower = line.to_lowercase();
    if lower.contains("error:")
        || lower.contains("error[")
        || lower.contains("error ts")
        || lower.starts_with("fatal:")
        || lower.starts_with("fail ")
    {
        return true;
    }
    // Excepciones de Python/JS al inicio de línea: `ModuleNotFoundError: ...`, `KeyError: ...`
    if let Some((head, _)) = line.split_once(':') {
        let word = head.trim();
        if !word.contains(' ') && (word.ends_with("Error") || word.ends_with("Exception")) {
            return true;
        }
    }
    false
}

fn read_dir_sorted(dir: &Path) -> io::Result<Vec<PathBuf>> {
    let mut entries: Vec<PathBuf> = std::fs::read_dir(dir)?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .collect();
    entries.sort();
    Ok(entries)
}

fn is_jsonl(path: &Path) -> bool {
    path.is_file() && path.extension().is_some_and(|e| e == "jsonl")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("wakeline-test-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn assistant(stop: &str, blocks: &str) -> String {
        format!(
            r#"{{"type":"assistant","sessionId":"s1","timestamp":"2026-11-08T10:00:00Z","cwd":"C:\\proj","gitBranch":"main","message":{{"stop_reason":"{stop}","content":[{blocks}]}}}}"#
        )
    }

    fn tool_error(id: &str, text: &str) -> String {
        format!(
            r#"{{"type":"user","sessionId":"s1","timestamp":"2026-11-08T10:01:00Z","cwd":"C:\\proj","message":{{"content":[{{"type":"tool_result","tool_use_id":"{id}","is_error":true,"content":"{text}"}}]}}}}"#
        )
    }

    #[test]
    fn reads_final_text_and_command_errors() {
        let dir = temp_dir("read");
        let file = dir.join("s1.jsonl");
        let lines = [
            r#"{"type":"user","sessionId":"s1","message":{"content":"hola"}}"#.to_string(),
            assistant(
                "tool_use",
                r#"{"type":"tool_use","id":"t1","name":"Bash","input":{}}"#,
            ),
            tool_error(
                "t1",
                r"Exit code 2\nsrc/a.ts(3,1): error TS2304: Cannot find name 'x'.",
            ),
            assistant(
                "tool_use",
                r#"{"type":"tool_use","id":"t2","name":"Read","input":{}}"#,
            ),
            tool_error("t2", "File does not exist."),
            assistant(
                "end_turn",
                r#"{"type":"text","text":"Queda pendiente probar en Windows."}"#,
            ),
        ];
        std::fs::write(&file, lines.join("\n") + "\n").unwrap();

        let result = read_from(&file, 0).unwrap();
        assert_eq!(result.bad_lines, 0);
        assert_eq!(
            result.events.iter().map(|e| &e.kind).collect::<Vec<_>>(),
            vec![
                &EventKind::ToolError {
                    tool: Some("Bash".into()),
                    message: "src/a.ts(3,1): error TS2304: Cannot find name 'x'.".into(),
                    output: "Exit code 2\nsrc/a.ts(3,1): error TS2304: Cannot find name 'x'."
                        .into(),
                },
                &EventKind::FinalText("Queda pendiente probar en Windows.".into()),
            ]
        );
        assert_eq!(result.events[0].cwd.as_deref(), Some("C:\\proj"));
    }

    #[test]
    fn resumes_from_offset_and_waits_for_complete_lines() {
        let dir = temp_dir("offset");
        let file = dir.join("s1.jsonl");
        let first = assistant("end_turn", r#"{"type":"text","text":"Primera respuesta."}"#);
        std::fs::write(&file, format!("{first}\n")).unwrap();

        let r1 = read_from(&file, 0).unwrap();
        assert_eq!(r1.events.len(), 1);

        // Se añade una línea a medio escribir: todavía no se lee.
        let second = assistant("end_turn", r#"{"type":"text","text":"Segunda respuesta."}"#);
        let mut f = std::fs::OpenOptions::new()
            .append(true)
            .open(&file)
            .unwrap();
        write!(f, "{}", &second[..20]).unwrap();
        let r2 = read_from(&file, r1.offset).unwrap();
        assert!(r2.events.is_empty());
        assert_eq!(r2.offset, r1.offset);

        // Se completa la línea: ahora sí.
        writeln!(f, "{}", &second[20..]).unwrap();
        let r3 = read_from(&file, r2.offset).unwrap();
        assert_eq!(r3.events.len(), 1);
    }

    #[test]
    fn rereads_a_file_that_shrank() {
        let dir = temp_dir("shrink");
        let file = dir.join("s1.jsonl");
        let line = assistant("end_turn", r#"{"type":"text","text":"Hola."}"#);
        std::fs::write(&file, format!("{line}\n")).unwrap();
        let result = read_from(&file, 10_000).unwrap();
        assert_eq!(result.events.len(), 1);
    }

    #[test]
    fn rejected_actions_are_not_errors() {
        let dir = temp_dir("rejected");
        let file = dir.join("s1.jsonl");
        let line = tool_error("t9", "The user doesn't want to proceed with this tool use.");
        std::fs::write(&file, format!("{line}\n")).unwrap();
        assert!(read_from(&file, 0).unwrap().events.is_empty());
    }

    #[test]
    fn discovers_sessions_and_subagents() {
        let root = temp_dir("discover");
        let project = root.join("C--proj");
        std::fs::create_dir_all(project.join("abc/subagents")).unwrap();
        std::fs::write(project.join("abc.jsonl"), "").unwrap();
        std::fs::write(project.join("abc/subagents/agent-1.jsonl"), "").unwrap();
        std::fs::write(project.join("notes.txt"), "").unwrap();

        let files = discover(&root).unwrap();
        assert_eq!(files.len(), 2);
        assert_eq!(files.iter().filter(|f| f.is_subagent).count(), 1);
        assert!(files.iter().any(|f| f.path.ends_with("abc.jsonl")));
    }

    #[test]
    fn invalid_lines_are_counted_and_skipped() {
        let dir = temp_dir("bad");
        let file = dir.join("s1.jsonl");
        let good = assistant("end_turn", r#"{"type":"text","text":"Bien."}"#);
        std::fs::write(&file, format!("{{\"type\":\"assistant\" roto\n{good}\n")).unwrap();
        let result = read_from(&file, 0).unwrap();
        assert_eq!(result.bad_lines, 1);
        assert_eq!(result.events.len(), 1);
    }

    #[test]
    fn head_and_empty_branches_are_treated_as_none() {
        assert_eq!(clean_branch(Some("HEAD".into())), None);
        assert_eq!(clean_branch(Some(" head ".into())), None);
        assert_eq!(clean_branch(Some("   ".into())), None);
        assert_eq!(clean_branch(Some("main".into())), Some("main".into()));
    }

    #[test]
    fn words_containing_error_substring_and_powershell_footers_are_ignored() {
        assert_eq!(
            error_message(&Value::String(
                r#"1|{"ok":true,"title":"Peli De Terror"}"#.into()
            )),
            None
        );
        assert_eq!(
            error_message(&Value::String(
                "+ FullyQualifiedErrorId : CommandNotFoundException".into()
            )),
            None
        );
    }
}
