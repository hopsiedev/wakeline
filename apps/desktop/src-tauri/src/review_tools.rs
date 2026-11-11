use serde_json::{Value, json};
use wakeline_core::{agents, github, store::LocalState};

#[tauri::command]
pub fn get_review_agents() -> Value {
    let claude = agents::find_agent("claude").is_some();
    let codex = agents::find_agent("codex").is_some();
    let antigravity = agents::find_editor_launcher("antigravity").is_some();
    let efforts = agents::PR_CHAT_MODELS
        .iter()
        .map(|model| (*model, agents::model_efforts(model)))
        .collect::<std::collections::BTreeMap<_, _>>();
    json!([
        {"id":"claude","name":"Claude","installed":claude,"available":claude,"models":agents::PR_CHAT_MODELS,"efforts":efforts,"images":true},
        {"id":"codex","name":"Codex","installed":codex,"available":false,"models":[]},
        {"id":"antigravity","name":"Antigravity","installed":antigravity,"available":false,"models":[]}
    ])
}

pub fn answer_workspace(
    options: &agents::ReviewOptions,
    question: &str,
    history: &[agents::ChatTurn],
    lang: &str,
    repository: Option<&str>,
) -> Result<String, String> {
    if question.trim().is_empty() || question.len() > 8_000 {
        return Err("INVALID_QUESTION".into());
    }
    if repository.is_some_and(|repo| !github_workspace_valid(repo)) {
        return Err("INVALID_REPOSITORY".into());
    }
    let path = LocalState::default_path().with_file_name("github-workspace.json");
    let envelope: Value =
        serde_json::from_slice(&std::fs::read(path).map_err(|_| "PR_CONTEXT_UNAVAILABLE")?)
            .map_err(|_| "PR_CONTEXT_UNAVAILABLE")?;
    let prs = envelope["data"]["pull_requests"]
        .as_array()
        .ok_or("PR_CONTEXT_UNAVAILABLE")?
        .iter()
        .filter(|pr| repository.is_none_or(|repo| pr["repository"].as_str() == Some(repo)))
        .cloned()
        .collect::<Vec<_>>();
    let prompt =
        agents::workspace_chat_prompt(&json!(prs), history, question, lang.starts_with("es"));
    agents::ask_review(options, &prompt, &std::sync::atomic::AtomicBool::new(false))
}
fn github_workspace_valid(repo: &str) -> bool {
    wakeline_core::github_workspace::valid_repository(repo)
}
#[tauri::command]
pub async fn ask_review_agent(
    options: agents::ReviewOptions,
    question: String,
    history: Vec<agents::ChatTurn>,
    lang: String,
    repository: Option<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        answer_workspace(&options, &question, &history, &lang, repository.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn open_pr_editor(repository: String, editor: String) -> Result<(), String> {
    if !github_workspace_valid(&repository) {
        return Err("INVALID_REPOSITORY".into());
    }
    let (cli, folder, exe) = match editor.as_str() {
        "vscode" => ("code", "Microsoft VS Code", "Code.exe"),
        "cursor" => ("cursor", "cursor", "Cursor.exe"),
        "antigravity" => ("antigravity", "Antigravity", "Antigravity.exe"),
        _ => return Err("UNKNOWN_EDITOR".into()),
    };
    let state = LocalState::load(&LocalState::default_path());
    let project = state
        .watched_folders
        .iter()
        .map(std::path::PathBuf::from)
        .find(|path| {
            github::github_repo(path).is_some_and(|repo| repo.eq_ignore_ascii_case(&repository))
        })
        .ok_or("LOCAL_REPOSITORY_NOT_WATCHED")?;
    let mut program = agents::find_editor_launcher(cli).filter(|path| {
        !cfg!(windows)
            || path
                .extension()
                .is_some_and(|e| e.eq_ignore_ascii_case("exe"))
    });
    if cfg!(windows) && program.is_none() {
        for base in [
            std::env::var_os("LOCALAPPDATA").map(|p| std::path::PathBuf::from(p).join("Programs")),
            std::env::var_os("ProgramFiles").map(std::path::PathBuf::from),
        ]
        .into_iter()
        .flatten()
        {
            let candidate = base.join(folder).join(exe);
            if candidate.is_file() {
                program = Some(candidate);
                break;
            }
        }
    }
    let mut command = std::process::Command::new(program.ok_or("EDITOR_NOT_INSTALLED")?);
    command.arg(project);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command.spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    #[test]
    fn editors_reject_unknown_launchers_and_invalid_repositories() {
        assert_eq!(
            super::open_pr_editor("owner/repo".into(), "shell".into()),
            Err("UNKNOWN_EDITOR".into())
        );
        assert_eq!(
            super::open_pr_editor("../../private".into(), "vscode".into()),
            Err("INVALID_REPOSITORY".into())
        );
    }
}
