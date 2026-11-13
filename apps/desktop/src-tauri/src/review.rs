//! Debug-only adapter for the local design review. The Vite process supplies an
//! isolated APPDATA copy; commands cannot execute project commands or write gh.
use serde_json::{Value, json};
use wakeline_core::github::SystemGh;

pub fn query(command: &str, input: Value) -> Result<Value, String> {
    match command {
        "get_review_agents" => Ok(crate::review_tools::get_review_agents()),
        "ask_review_agent" => {
            let history: Vec<wakeline_core::agents::ChatTurn> =
                serde_json::from_value(input["history"].clone()).unwrap_or_default();
            crate::review_tools::answer_workspace(
                &serde_json::from_value(input["options"].clone())
                    .map_err(|_| "INVALID_REVIEW_OPTIONS")?,
                input["question"].as_str().unwrap_or_default(),
                &history,
                input["lang"].as_str().unwrap_or("en"),
                input["repository"].as_str(),
                &std::sync::atomic::AtomicBool::new(false),
            )
            .map(Value::String)
        }
        "get_intelligence" => crate::intelligence::load_intelligence(),
        "get_account" => serde_json::to_value(wakeline_core::account::read_account(
            &crate::user_home(),
            env!("CARGO_PKG_VERSION").into(),
        ))
        .map_err(|e| e.to_string()),
        "get_dashboard_data" => crate::scan_dashboard()
            .and_then(|value| serde_json::to_value(value).map_err(|e| e.to_string())),
        "get_github_workspace" => wakeline_core::github_workspace::cached(
            input["since"].as_str().ok_or("INVALID_PERIOD")?,
        ),
        "get_remote_pr_details" => {
            let repo = input["repository"].as_str().ok_or("INVALID_REPOSITORY")?;
            if !wakeline_core::github_workspace::valid_repository(repo) {
                return Err("INVALID_REPOSITORY".into());
            }
            let details = wakeline_core::github::fetch_pr_details(
                &SystemGh,
                repo,
                input["number"].as_u64().ok_or("INVALID_PR")?,
            )
            .map_err(|e| e.to_string())?;
            serde_json::to_value(details).map_err(|e| e.to_string())
        }
        "ask_pr_agent" => {
            let history: Vec<wakeline_core::agents::ChatTurn> =
                serde_json::from_value(input["history"].clone()).unwrap_or_default();
            crate::answer_pr_question(
                input["repository"].as_str().ok_or("INVALID_REPOSITORY")?,
                input["number"].as_u64().ok_or("INVALID_PR")?,
                input["title"].as_str().unwrap_or_default(),
                &serde_json::from_value(input["options"].clone())
                    .map_err(|_| "INVALID_REVIEW_OPTIONS")?,
                input["question"].as_str().unwrap_or_default(),
                &history,
                input["lang"].as_str().unwrap_or("en"),
                &std::sync::atomic::AtomicBool::new(false),
            )
            .map(Value::String)
        }
        "get_mcp_executable" => Ok(std::env::var("WAKELINE_REVIEW_CLI")
            .ok()
            .filter(|p| std::path::Path::new(p).is_file())
            .map(Value::String)
            .unwrap_or(Value::Null)),
        "history_import_status" => Ok(json!(
            wakeline_core::store::LocalState::load(
                &wakeline_core::store::LocalState::default_path()
            )
            .full_session_history
        )),
        "get_startup_enabled" => crate::startup::enabled().map(|value| json!(value)),
        "check_update" => serde_json::to_value(crate::updates::check_manual_release(
            env!("CARGO_PKG_VERSION").into(),
        )?)
        .map_err(|e| e.to_string()),
        _ => Err("DESKTOP_ACTION_REQUIRED".into()),
    }
    .map_err(|error| wakeline_core::redact::redact(&error))
}
