//! Supervised read-only proposals from locally installed agents. Never invokes a shell.
use crate::commands::exec::{job, read_in_background, resolve_program};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

pub fn agent_arguments(agent: &str) -> Result<Vec<String>, String> {
    let args = match agent {
        "codex" => vec![
            "exec",
            "--sandbox",
            "read-only",
            "--config",
            "approval_policy=\"never\"",
            "--config",
            "mcp_servers={}",
            "--ephemeral",
            "--json",
            "-",
        ],
        "claude" => vec![
            "--print",
            "--permission-mode",
            "plan",
            "--tools",
            "Read,Grep,Glob",
            "--strict-mcp-config",
            "--mcp-config",
            "{\"mcpServers\":{}}",
            "--setting-sources",
            "",
            "--no-session-persistence",
            "--output-format",
            "json",
        ],
        _ => return Err("UNKNOWN_AGENT".into()),
    };
    Ok(args.into_iter().map(String::from).collect())
}
pub fn find_agent(agent: &str) -> Option<PathBuf> {
    if !matches!(agent, "codex" | "claude") {
        return None;
    }
    if let Some(path) = resolve_program(agent, Path::new(".")) {
        if !cfg!(windows)
            || path
                .extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("exe"))
        {
            return Some(path);
        }
        if agent == "codex"
            && let Some(root) = path.parent()
        {
            let package = root.join("node_modules/@openai/codex");
            for (platform, target) in [
                ("win32-x64", "x86_64-pc-windows-msvc"),
                ("win32-arm64", "aarch64-pc-windows-msvc"),
            ] {
                let candidates = [
                    package.join(format!(
                        "node_modules/@openai/codex-{platform}/vendor/{target}/bin/codex.exe"
                    )),
                    package.join(format!("vendor/{target}/codex/codex.exe")),
                ];
                if let Some(path) = candidates.into_iter().find(|path| path.is_file()) {
                    return Some(path);
                }
            }
        }
    }
    if agent == "claude"
        && let Some(home) = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"))
    {
        let candidate = PathBuf::from(home).join(if cfg!(windows) {
            ".local/bin/claude.exe"
        } else {
            ".local/bin/claude"
        });
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}
pub fn proposal_text(agent: &str, output: &str) -> String {
    if agent == "codex" {
        output
            .lines()
            .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
            .filter_map(|value| {
                let item = value.get("item")?;
                (item.get("type")?.as_str()? == "agent_message").then(|| {
                    item.get("text")
                        .and_then(|text| text.as_str())
                        .unwrap_or_default()
                        .to_string()
                })
            })
            .collect::<Vec<_>>()
            .join("\n\n")
    } else {
        serde_json::from_str::<serde_json::Value>(output)
            .ok()
            .and_then(|value| {
                value
                    .get("result")
                    .and_then(|v| v.as_str())
                    .map(String::from)
            })
            .unwrap_or_default()
    }
}
pub fn run_analysis(
    agent: &str,
    root: &Path,
    prompt: &str,
    cancel: &AtomicBool,
) -> Result<String, String> {
    let program = find_agent(agent).ok_or("AGENT_NOT_INSTALLED")?;
    let args = agent_arguments(agent)?;
    run_agent(agent, &program, &args, root, prompt, cancel)
}

fn run_agent(
    agent: &str,
    program: &Path,
    args: &[String],
    root: &Path,
    prompt: &str,
    cancel: &AtomicBool,
) -> Result<String, String> {
    let mut command = Command::new(program);
    command
        .args(args)
        .current_dir(root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    if args.iter().any(|arg| arg == "stream-json") {
        command.env_remove("CLAUDE_CODE_EFFORT_LEVEL");
    }
    let mut child = command.spawn().map_err(|e| e.to_string())?;
    let job = job::Job::assign(&child);
    let stdout = read_in_background(child.stdout.take());
    let stderr = read_in_background(child.stderr.take());
    let input = prompt.to_owned();
    let stdin = child.stdin.take();
    let writer = std::thread::spawn(move || {
        if let Some(mut stdin) = stdin {
            stdin.write_all(input.as_bytes())?;
        }
        Ok::<(), io::Error>(())
    });
    let started = Instant::now();
    let mut stopped = false;
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            break status;
        }
        if cancel.load(Ordering::Relaxed) || started.elapsed() > Duration::from_secs(600) {
            stopped = true;
            if let Some(job) = &job {
                job.terminate();
            } else {
                let _ = child.kill();
            }
            break child.wait().map_err(|e| e.to_string())?;
        }
        std::thread::sleep(Duration::from_millis(100));
    };
    // Stop descendants holding stdout after the main agent has exited.
    if let Some(job) = &job {
        job.terminate();
    }
    let _ = writer.join();
    let out = stdout.join().unwrap_or_default();
    let err = stderr.join().unwrap_or_default();
    if stopped {
        return Err("AGENT_CANCELLED_OR_TIMED_OUT".into());
    }
    if !status.success() {
        if args
            .windows(2)
            .any(|p| p == ["--input-format", "stream-json"])
            && let Err(message) = review_result(&out)
            && message != "AGENT_NO_PROPOSAL"
        {
            return Err(message);
        }
        return Err(crate::redact::redact(&err).chars().take(4000).collect());
    }
    if args
        .windows(2)
        .any(|p| p == ["--input-format", "stream-json"])
    {
        return review_result(&out);
    }
    let proposal = proposal_text(agent, &out);
    if proposal.trim().is_empty() {
        return Err("AGENT_NO_PROPOSAL".into());
    }
    Ok(crate::redact::redact(&proposal)
        .chars()
        .take(100_000)
        .collect())
}
/// Claude models offered in the PR chat (CLI aliases).
pub const PR_CHAT_MODELS: [&str; 10] = [
    "sonnet",
    "opus",
    "haiku",
    "claude-sonnet-5-5",
    "claude-opus-5-5",
    "claude-haiku-5-5",
    "claude-sonnet-5",
    "claude-opus-5",
    "claude-sonnet-4-6",
    "claude-opus-4-6",
];
/// Diff characters sent to the agent; the rest is cut and said so.
const PR_CHAT_DIFF_LIMIT: usize = 150_000;

/// One earlier message of the PR conversation.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct ChatTurn {
    pub role: String,
    pub text: String,
}

/// The PR chat agent has no tools at all: it cannot read files, run commands or
/// reach MCP servers. It only sees the prompt built by [`pr_chat_prompt`].
pub fn pr_chat_arguments(model: &str) -> Result<Vec<String>, String> {
    if !PR_CHAT_MODELS.contains(&model) {
        return Err("UNKNOWN_MODEL".into());
    }
    Ok([
        "--print",
        "--tools",
        "",
        "--strict-mcp-config",
        "--mcp-config",
        "{\"mcpServers\":{}}",
        "--setting-sources",
        "",
        "--no-session-persistence",
        "--output-format",
        "json",
        "--model",
        model,
    ]
    .into_iter()
    .map(String::from)
    .collect())
}

/// Title, description and diff of the PR (excluded files already removed by
/// `fetch_pr_details`), earlier turns and the question. Secrets are redacted.
pub fn pr_chat_prompt(
    repository: &str,
    number: u64,
    title: &str,
    details: &crate::github::PullRequestDetails,
    history: &[ChatTurn],
    question: &str,
    spanish: bool,
) -> String {
    let mut diff = String::new();
    for file in &details.files {
        diff.push_str(&format!(
            "--- {} (+{} -{})\n{}\n",
            file.filename,
            file.additions,
            file.deletions,
            file.patch.as_deref().unwrap_or("(sin diff / no patch)")
        ));
    }
    if diff.len() > PR_CHAT_DIFF_LIMIT {
        let mut cut = PR_CHAT_DIFF_LIMIT;
        while !diff.is_char_boundary(cut) {
            cut -= 1;
        }
        diff.truncate(cut);
        diff.push_str("\n[diff truncated]\n");
    }
    let mut conversation = String::new();
    for turn in history.iter().rev().take(12).rev() {
        let who = if turn.role == "user" {
            "User"
        } else {
            "Assistant"
        };
        conversation.push_str(&format!("{who}: {}\n\n", turn.text));
    }
    let language = if spanish { "Spanish" } else { "English" };
    let prompt = format!(
        "You are reviewing a GitHub pull request inside Wakeline. You have no tools: answer only \
         from the description and diff below. If something is not in them, say so. Be concise, \
         cite file names and lines, and answer in {language}.\n\n\
         Pull request: {repository}#{number} — {title}\n\n\
         Description:\n{body}\n\n\
         Diff:\n{diff}\n\
         Conversation so far:\n{conversation}\
         User: {question}\n",
        body = details.body
    );
    crate::redact::redact(&prompt)
}

/// Asks Claude about a pull request from an empty working directory, without tools.
pub fn ask_about_pr(model: &str, prompt: &str, cancel: &AtomicBool) -> Result<String, String> {
    let program = find_agent("claude").ok_or("AGENT_NOT_INSTALLED")?;
    let args = pr_chat_arguments(model)?;
    let empty = tempfile::tempdir().map_err(|e| e.to_string())?;
    run_agent("claude", &program, &args, empty.path(), prompt, cancel)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pr_chat_agent_has_no_tools_and_only_known_models() {
        let args = pr_chat_arguments("sonnet").unwrap();
        assert!(args.windows(2).any(|pair| pair == ["--tools", ""]));
        assert!(args.contains(&"--strict-mcp-config".into()));
        assert!(
            !args
                .iter()
                .any(|arg| arg.contains("Read") || arg.contains("Bash"))
        );
        assert!(pr_chat_arguments("sonnet --dangerously-skip-permissions").is_err());
    }

    #[test]
    fn pr_chat_prompt_carries_the_diff_and_redacts_secrets() {
        let details = crate::github::PullRequestDetails {
            body: "Adds login".into(),
            files: vec![crate::github::PullRequestFile {
                filename: "src/auth.ts".into(),
                additions: 1,
                deletions: 0,
                patch: Some("+const key = \"ghp_abcdefghijklmnopqrstuvwxyz0123456789\";".into()),
            }],
        };
        let history = [ChatTurn {
            role: "user".into(),
            text: "first question".into(),
        }];
        let prompt = pr_chat_prompt("o/r", 7, "Login", &details, &history, "Is it safe?", true);
        assert!(prompt.contains("src/auth.ts"));
        assert!(prompt.contains("User: first question"));
        assert!(prompt.contains("Is it safe?"));
        assert!(prompt.contains("Spanish"));
        assert!(!prompt.contains("ghp_abcdefghijklmnopqrstuvwxyz0123456789"));
    }
    #[test]
    fn agent_policies_never_allow_project_writes() {
        let codex = agent_arguments("codex").unwrap();
        assert!(
            codex
                .windows(2)
                .any(|pair| pair == ["--sandbox", "read-only"])
        );
        assert!(
            !codex
                .iter()
                .any(|arg| arg.contains("dangerously") || arg == "workspace-write")
        );
        let claude = agent_arguments("claude").unwrap();
        assert!(
            claude
                .windows(2)
                .any(|pair| pair == ["--tools", "Read,Grep,Glob"])
        );
        assert!(claude.contains(&"--strict-mcp-config".into()));
        assert!(agent_arguments("arbitrary command").is_err());
    }

    #[test]
    fn codex_final_answer_is_extracted_without_exposing_tool_logs() {
        let output = r#"{"type":"item.completed","item":{"type":"command_execution","aggregated_output":"tool log"}}
{"type":"item.completed","item":{"type":"agent_message","text":"Proposed fix"}}"#;
        assert_eq!(proposal_text("codex", output), "Proposed fix");
    }
}

#[cfg(test)]
mod workspace_chat_tests {
    #[test]
    fn overview_context_uses_only_pr_metadata_and_redacts_secrets() {
        let prs = serde_json::json!([{"repository":"o/r","number":7,"title":"Fix ghp_abcdefghijklmnopqrstuvwxyz0123456789","state":"merged","body":"PRIVATE BODY","patch":"PRIVATE DIFF"}]);
        let prompt = super::workspace_chat_prompt(&prs, &[], "Which PRs merged?", false);
        assert!(prompt.contains("merged"));
        assert!(prompt.contains("Which PRs merged?"));
        assert!(!prompt.contains("PRIVATE BODY"));
        assert!(!prompt.contains("PRIVATE DIFF"));
        assert!(!prompt.contains("ghp_abcdefghijklmnopqrstuvwxyz0123456789"));
    }
}

/// Review overview has metadata only; single-PR diffs never enter this context.
pub fn workspace_chat_prompt(
    prs: &serde_json::Value,
    history: &[ChatTurn],
    question: &str,
    spanish: bool,
) -> String {
    let mut rows = String::new();
    for pr in prs.as_array().into_iter().flatten().take(300) {
        rows.push_str(&format!(
            "{}#{} | {} | {} | {}\n",
            pr["repository"].as_str().unwrap_or(""),
            pr["number"],
            pr["state"].as_str().unwrap_or(""),
            pr["title"].as_str().unwrap_or(""),
            pr["updated_at"].as_str().unwrap_or("")
        ));
    }
    let conversation = history
        .iter()
        .rev()
        .take(12)
        .rev()
        .map(|turn| {
            format!(
                "{}: {}\n",
                if turn.role == "user" {
                    "User"
                } else {
                    "Assistant"
                },
                turn.text
            )
        })
        .collect::<String>();
    crate::redact::redact(&format!(
        "You review a cached GitHub PR overview in Wakeline. No tools or files. Answer only from the following metadata (not diffs); state when information is missing. Data may be partial. Answer in {}.\nPR metadata:\n{}\nConversation:\n{}\nUser: {}",
        if spanish { "Spanish" } else { "English" },
        rows,
        conversation,
        question
    ))
}

/// Resolve only supported editor launchers, without shell dispatch.
pub fn find_editor_launcher(editor: &str) -> Option<PathBuf> {
    let name = match editor {
        "code" | "cursor" | "antigravity" => editor,
        _ => return None,
    };
    resolve_program(name, Path::new("."))
}

#[cfg(test)]
mod review_input_tests {
    #[test]
    fn version_and_effort_are_passed_without_enabling_tools() {
        let options = super::ReviewOptions {
            model: "claude-sonnet-5-5".into(),
            effort: "high".into(),
            images: vec![],
        };
        let args = super::review_arguments(&options).unwrap();
        assert!(
            args.windows(2)
                .any(|p| p == ["--model", "claude-sonnet-5-5"])
        );
        assert!(args.windows(2).any(|p| p == ["--effort", "high"]));
        assert!(args.windows(2).any(|p| p == ["--tools", ""]));
        assert!(
            args.windows(2)
                .any(|p| p == ["--input-format", "stream-json"])
        );
        let mut invalid = options;
        invalid.effort = "high --tools Read".into();
        assert!(super::review_arguments(&invalid).is_err());
    }
    #[test]
    fn image_is_embedded_and_invalid_image_payloads_are_rejected() {
        let image = super::ChatImage {
            media_type: "image/png".into(),
            data: "iVBORw0KGgo=".into(),
        };
        let input = super::review_input("question", &[image]).unwrap();
        let json: serde_json::Value = serde_json::from_str(input.trim()).unwrap();
        assert_eq!(json["message"]["content"][1]["source"]["type"], "base64");
        assert_eq!(json["message"]["content"][0]["text"], "question");
        assert!(
            super::review_input(
                "q",
                &[super::ChatImage {
                    media_type: "image/svg+xml".into(),
                    data: "PHN2Zz4=".into()
                }]
            )
            .is_err()
        );
        assert!(
            super::review_input(
                "q",
                &[super::ChatImage {
                    media_type: "image/jpeg".into(),
                    data: "iVBORw0KGgo=".into()
                }]
            )
            .is_err()
        );
    }
    #[test]
    fn streamed_result_preserves_errors_instead_of_an_empty_success() {
        assert_eq!(super::review_result("{\"type\":\"system\"}\n{\"type\":\"result\",\"is_error\":false,\"result\":\"done\"}\n").unwrap(),"done");
        assert!(
            super::review_result(
                "{\"type\":\"result\",\"is_error\":true,\"result\":\"model unavailable\"}"
            )
            .is_err()
        );
    }
}

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct ChatImage {
    pub media_type: String,
    pub data: String,
}
#[derive(Debug, Clone, serde::Deserialize)]
pub struct ReviewOptions {
    pub model: String,
    #[serde(default = "default_effort")]
    pub effort: String,
    #[serde(default)]
    pub images: Vec<ChatImage>,
}
fn default_effort() -> String {
    "default".into()
}
pub fn model_efforts(model: &str) -> Vec<&'static str> {
    if model == "claude-sonnet-4-6" || model == "claude-opus-4-6" {
        vec!["default", "low", "medium", "high", "max"]
    } else {
        vec!["default", "low", "medium", "high", "xhigh", "max"]
    }
}
pub fn review_arguments(options: &ReviewOptions) -> Result<Vec<String>, String> {
    let mut args = pr_chat_arguments(&options.model)?;
    if !model_efforts(&options.model).contains(&options.effort.as_str()) {
        return Err("UNKNOWN_EFFORT".into());
    }
    if options.effort != "default" {
        args.extend(["--effort".into(), options.effort.clone()]);
    }
    if let Some(index) = args.iter().position(|arg| arg == "--output-format") {
        args[index + 1] = "stream-json".into();
    }
    args.extend([
        "--verbose".into(),
        "--input-format".into(),
        "stream-json".into(),
    ]);
    Ok(args)
}
pub fn review_input(prompt: &str, images: &[ChatImage]) -> Result<String, String> {
    use base64::Engine;
    if images.len() > 3 {
        return Err("IMAGE_LIMIT".into());
    }
    let mut total = 0;
    let mut content = vec![serde_json::json!({"type":"text","text":prompt})];
    for image in images {
        if image.data.len() > 7_000_000 {
            return Err("IMAGE_LIMIT".into());
        }
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(&image.data)
            .map_err(|_| "IMAGE_INVALID")?;
        total += bytes.len();
        if bytes.len() > 5 * 1024 * 1024 || total > 10 * 1024 * 1024 {
            return Err("IMAGE_LIMIT".into());
        }
        let valid = match image.media_type.as_str() {
            "image/png" => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
            "image/jpeg" => bytes.starts_with(&[255, 216, 255]),
            "image/gif" => bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a"),
            "image/webp" => bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP"),
            _ => false,
        };
        if !valid {
            return Err("IMAGE_INVALID".into());
        }
        content.push(serde_json::json!({"type":"image","source":{"type":"base64","media_type":image.media_type,"data":image.data}}));
    }
    Ok(format!(
        "{}\n",
        serde_json::json!({"type":"user","message":{"role":"user","content":content},"parent_tool_use_id":null})
    ))
}
pub fn review_result(output: &str) -> Result<String, String> {
    let value = output
        .lines()
        .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
        .rfind(|v| v["type"] == "result")
        .ok_or("AGENT_NO_PROPOSAL")?;
    let text = crate::redact::redact(value["result"].as_str().unwrap_or_default());
    if value["is_error"] == true || value["subtype"].as_str().is_some_and(|s| s != "success") {
        return Err(if text.is_empty() {
            "AGENT_REQUEST_FAILED".into()
        } else {
            text
        });
    }
    if text.trim().is_empty() {
        return Err("AGENT_NO_PROPOSAL".into());
    }
    Ok(text.chars().take(100_000).collect())
}
pub fn ask_review(
    options: &ReviewOptions,
    prompt: &str,
    cancel: &AtomicBool,
) -> Result<String, String> {
    let args = review_arguments(options)?;
    let input = review_input(prompt, &options.images)?;
    let program = find_agent("claude").ok_or("AGENT_NOT_INSTALLED")?;
    let empty = tempfile::tempdir().map_err(|e| e.to_string())?;
    run_agent("claude", &program, &args, empty.path(), &input, cancel)
}
