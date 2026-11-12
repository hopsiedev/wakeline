//! Account-wide, read-only GitHub data. Independent of watched local folders.
//!
//! The sync is incremental so the account stays well under GitHub's rate limits:
//! pull requests are read newest-updated first and paging stops at the last known
//! change, reviews are only read for pull requests that changed, and commits are
//! only read for repositories whose `pushed_at` moved. When GitHub limits the
//! account, the saved data is returned and no call is made until the reset time.
use crate::github::GhClient;

use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

use serde_json::{Value, json};

/// Seconds a successful sync is reused before asking GitHub again.
const FRESH_SECS: u64 = 10 * 60;
/// Seconds a sync is reused even when the user asks to refresh.
const FORCED_FRESH_SECS: u64 = 30;
/// Seconds a failed sync (without saved data) is reused before retrying.
const ERROR_SECS: u64 = 5 * 60;
/// Cool-down when GitHub limits the account and does not say until when.
const COOLDOWN_SECS: u64 = 15 * 60;
/// Hard cap of pull request pages read per repository in one incremental sync.
const MAX_PAGES: usize = 10;

/// Only one sync at a time: the dashboard and the PR notifier share the cache.
static SYNC: Mutex<()> = Mutex::new(());

/// Repositories read at the same time during a sync.
const PARALLEL_REPOS: usize = 8;

/// The sync reads several repositories at once, so the client is shared between threads.
type SharedGh<'a> = &'a (dyn GhClient + Sync);

struct RateGuard<'a> {
    inner: SharedGh<'a>,
    blocked: AtomicBool,
}
impl RateGuard<'_> {
    fn is_blocked(&self) -> bool {
        self.blocked.load(Ordering::Relaxed)
    }
}
impl GhClient for RateGuard<'_> {
    fn run(&self, args: &[&str]) -> Result<String, crate::github::GhError> {
        if self.is_blocked() {
            return Err(crate::github::GhError::Failed("GITHUB_RATE_LIMITED".into()));
        }
        let result = self.inner.run(args);
        if result
            .as_ref()
            .is_err_and(|error| is_rate_limit(&error.to_string()))
        {
            self.blocked.store(true, Ordering::Relaxed);
            return Err(crate::github::GhError::Failed("GITHUB_RATE_LIMITED".into()));
        }
        result
    }
}

/// GitHub itself disabled the repository (DMCA, billing, TOS): nothing Wakeline can
/// fix or retry, so it is not reported as missing data.
fn is_blocked(message: &str) -> bool {
    let message = message.to_lowercase();
    message.contains("repository access blocked") || message.contains("repository is disabled")
}

fn is_rate_limit(message: &str) -> bool {
    let message = message.to_lowercase();
    message.contains("rate limit") || message.contains("abuse detection")
}

/// Cache survives WebView reloads and restarts. See the module docs for the policy.
pub fn cached(since: &str) -> Result<Value, String> {
    cached_within(since, FRESH_SECS)
}

/// Same as [`cached`], but only reuses a sync from the last few seconds: the user
/// asked to refresh. A rate-limit cool-down is still respected.
pub fn refreshed(since: &str) -> Result<Value, String> {
    cached_within(since, FORCED_FRESH_SECS)
}

fn cached_within(since: &str, fresh_secs: u64) -> Result<Value, String> {
    let _sync = SYNC.lock().unwrap_or_else(|error| error.into_inner());
    let path = crate::store::LocalState::default_path().with_file_name("github-workspace.json");
    let envelope = std::fs::read(&path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
        .unwrap_or(Value::Null);
    let (value, write) = decide_within(
        &crate::github::SystemGh,
        since,
        &envelope,
        crate::github::unix_now(),
        fresh_secs,
    );
    if let Some(next) = write {
        save(&path, &next);
    }
    value
}

#[cfg(test)]
fn decide(
    gh: SharedGh<'_>,
    since: &str,
    envelope: &Value,
    now: u64,
) -> (Result<Value, String>, Option<Value>) {
    decide_within(gh, since, envelope, now, FRESH_SECS)
}

/// Pure cache policy: what to answer and what to store, given the saved envelope.
fn decide_within(
    gh: SharedGh<'_>,
    since: &str,
    envelope: &Value,
    now: u64,
    fresh_secs: u64,
) -> (Result<Value, String>, Option<Value>) {
    let saved = envelope["data"].is_object().then(|| &envelope["data"]);
    let at = envelope["at"].as_u64().unwrap_or_default();
    if let Some(until) = envelope["blocked_until"]
        .as_u64()
        .filter(|until| now < *until)
    {
        return (
            saved
                .map(|data| limited(data, since, until))
                .ok_or_else(|| "GITHUB_RATE_LIMITED".to_string()),
            None,
        );
    }
    if let Some(data) = saved
        && now.saturating_sub(at) < fresh_secs
    {
        return (Ok(prune(data, since)), None);
    }
    if saved.is_none()
        && let Some(error) = envelope["error"].as_str()
        && now.saturating_sub(at) < ERROR_SECS
    {
        return (Err(error.into()), None);
    }
    match sync(gh, since, saved, now) {
        Ok(Synced::Complete(data)) => (Ok(data.clone()), Some(json!({"at":now,"data":data}))),
        Ok(Synced::Limited(data, until)) => (
            Ok(limited(&data, since, until)),
            Some(json!({"at":now,"data":data,"blocked_until":until})),
        ),
        Err(error) if error == "GITHUB_RATE_LIMITED" => {
            let until = now + COOLDOWN_SECS;
            let mut next = envelope.clone();
            if !next.is_object() {
                next = json!({});
            }
            next["blocked_until"] = json!(until);
            (
                saved
                    .map(|data| limited(data, since, until))
                    .ok_or_else(|| error.clone()),
                Some(next),
            )
        }
        Err(error) => match saved {
            // Keep showing the saved account; the error only delays the next try.
            Some(data) => {
                let mut stale = prune(data, since);
                stale["sync_error"] = json!(error);
                (Ok(stale), Some(json!({"at":now,"data":data})))
            }
            None => (Err(error.clone()), Some(json!({"at":now,"error":error}))),
        },
    }
}

fn save(path: &std::path::Path, envelope: &Value) {
    let Ok(bytes) = serde_json::to_vec(envelope) else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
        if let Ok(mut temp) = tempfile::NamedTempFile::new_in(parent) {
            use std::io::Write;
            if temp.write_all(&bytes).is_ok() {
                let _ = temp.persist(path);
            }
        }
    }
}

/// Saved data marked as limited, so the UI can say until when it is frozen.
fn limited(data: &Value, since: &str, until: u64) -> Value {
    let mut data = prune(data, since);
    data["rate_limited_until"] = json!(until);
    data
}

/// Drops commits older than the requested period; pull requests keep their history.
fn prune(data: &Value, since: &str) -> Value {
    let mut data = data.clone();
    if let Some(commits) = data["commits"].as_array_mut() {
        commits.retain(|commit| commit["at"].as_str().is_some_and(|at| at >= since));
    }
    data
}

pub fn valid_repository(name: &str) -> bool {
    let parts: Vec<_> = name.split('/').collect();
    parts.len() == 2
        && parts.iter().all(|part| {
            !part.is_empty()
                && *part != "."
                && *part != ".."
                && part
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
        })
}

fn pages(gh: &dyn GhClient, route: &str) -> Result<Vec<Value>, String> {
    pages_with_cache(gh, route, "5m")
}
fn pages_with_cache(gh: &dyn GhClient, route: &str, duration: &str) -> Result<Vec<Value>, String> {
    let output = gh
        .run(&["api", route, "--paginate", "--slurp", "--cache", duration])
        .map_err(|e| crate::redact::redact(&e.to_string()))?;
    let outer: Vec<Vec<Value>> = serde_json::from_str(&output).map_err(|e| e.to_string())?;
    Ok(outer.into_iter().flatten().collect())
}
fn page(gh: &dyn GhClient, route: &str) -> Result<Vec<Value>, String> {
    let output = gh
        .run(&["api", route])
        .map_err(|e| crate::redact::redact(&e.to_string()))?;
    serde_json::from_str(&output).map_err(|e| e.to_string())
}
/// GitHub accounts that GitHub itself links to the agents' `Co-authored-by` emails.
const AGENT_ACCOUNTS: &[(&str, &str)] = &[
    ("noreply@anthropic.com", "claude"),
    ("noreply@openai.com", "codex"),
];

/// The coding agent named in a `Co-authored-by:` trailer of the commit message.
fn agent_co_author(message: &str) -> Option<&'static str> {
    message.lines().find_map(|line| {
        let (key, value) = line.trim().split_once(':')?;
        if !key.trim().eq_ignore_ascii_case("co-authored-by") {
            return None;
        }
        let email = value.split_once('<')?.1.split_once('>')?.0.trim();
        AGENT_ACCOUNTS
            .iter()
            .find(|(known, _)| known.eq_ignore_ascii_case(email))
            .map(|(_, login)| *login)
    })
}

/// Profile picture of an agent account, read once per sync and cached by `gh` for a day.
fn agent_avatar(gh: &dyn GhClient, login: &str) -> Option<String> {
    let output = gh
        .run(&["api", &format!("users/{login}"), "--cache", "24h"])
        .ok()?;
    let user: Value = serde_json::from_str(&output).ok()?;
    user["avatar_url"].as_str().map(str::to_string)
}

fn text(value: &Value, key: &str) -> String {
    value[key].as_str().unwrap_or_default().to_string()
}

/// Seconds since the epoch when the core REST quota comes back, if it is spent.
/// `rate_limit` does not count against the quota.
/// Lines changed and comment counts of the pull requests updated after `from`.
/// One GraphQL call per repository (its own quota, not the REST one); best effort.
fn pr_stats(gh: &dyn GhClient, name: &str, from: &str) -> HashMap<u64, Value> {
    let search = format!("updated:>{from}");
    gh.run(&[
        "pr",
        "list",
        "-R",
        name,
        "--state",
        "all",
        "--limit",
        "300",
        "--search",
        &search,
        "--json",
        "number,additions,deletions,comments",
        "--jq",
        "map({number,additions,deletions,comments:(.comments|length)})",
    ])
    .ok()
    .and_then(|output| serde_json::from_str::<Vec<Value>>(&output).ok())
    .into_iter()
    .flatten()
    .filter_map(|item| Some((item["number"].as_u64()?, item)))
    .collect()
}

fn quota_reset(gh: &dyn GhClient, needed: u64) -> Option<u64> {
    let output = gh.run(&["api", "rate_limit"]).ok()?;
    let value: Value = serde_json::from_str(&output).ok()?;
    let core = &value["resources"]["core"];
    let remaining = core["remaining"].as_u64()?;
    (remaining < needed)
        .then(|| core["reset"].as_u64())
        .flatten()
}

enum Synced {
    Complete(Value),
    /// Data merged with what was saved, and the time the account is free again.
    Limited(Value, u64),
}

/// Full read, used by tests and by the first sync of an account.
pub fn load(gh: SharedGh<'_>, since: &str) -> Result<Value, String> {
    match sync(gh, since, None, crate::github::unix_now())? {
        Synced::Complete(data) => Ok(data),
        Synced::Limited(..) => Err("GITHUB_RATE_LIMITED".into()),
    }
}

fn sync(gh: SharedGh<'_>, since: &str, saved: Option<&Value>, now: u64) -> Result<Synced, String> {
    if since.len() > 40
        || !since.ends_with('Z')
        || !since
            .chars()
            .all(|c| c.is_ascii_digit() || matches!(c, '-' | ':' | 'T' | 'Z' | '.'))
    {
        return Err("INVALID_PERIOD".into());
    }
    let known_repos = saved
        .and_then(|data| data["repositories"].as_array())
        .map_or(0, Vec::len) as u64;
    if let Some(reset) = quota_reset(gh, 20 + known_repos * 3) {
        return match saved {
            Some(data) => Ok(Synced::Limited(prune(data, since), reset.max(now + 60))),
            None => Err("GITHUB_RATE_LIMITED".into()),
        };
    }
    let guarded = RateGuard {
        inner: gh,
        blocked: AtomicBool::new(false),
    };
    let gh: &dyn GhClient = &guarded;
    let user: Value = serde_json::from_str(
        &gh.run(&["api", "user", "--cache", "15m"])
            .map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    if user["login"].as_str().is_none_or(str::is_empty) {
        return Err("GITHUB_ACCOUNT_UNAVAILABLE".into());
    }
    let repositories = pages(
        gh,
        "user/repos?affiliation=owner,collaborator,organization_member&sort=pushed&per_page=100",
    )?;

    // What was saved, per repository, to merge with the changes.
    let mut saved_prs: HashMap<String, Vec<Value>> = HashMap::new();
    let mut saved_commits: HashMap<String, Vec<Value>> = HashMap::new();
    let mut saved_pushed: HashMap<String, String> = HashMap::new();
    if let Some(data) = saved {
        for pr in data["pull_requests"].as_array().into_iter().flatten() {
            saved_prs
                .entry(text(pr, "repository"))
                .or_default()
                .push(pr.clone());
        }
        for commit in data["commits"].as_array().into_iter().flatten() {
            saved_commits
                .entry(text(commit, "repository"))
                .or_default()
                .push(commit.clone());
        }
        for repo in data["repositories"].as_array().into_iter().flatten() {
            saved_pushed.insert(text(repo, "name"), text(repo, "pushed_at"));
        }
    }

    let mut warnings = Vec::new();
    let mut jobs = Vec::new();
    for repo in repositories {
        let name = text(&repo, "full_name");
        if !valid_repository(&name) {
            warnings.push("INVALID_REPOSITORY".to_string());
            continue;
        }
        jobs.push(RepoJob {
            unchanged: saved_pushed
                .get(&name)
                .is_some_and(|pushed| *pushed == text(&repo, "pushed_at")),
            saved_prs: saved_prs.remove(&name),
            saved_commits: saved_commits.remove(&name).unwrap_or_default(),
            name,
            repo,
        });
    }

    // Each repository costs at least one `gh` process (~0.5 s on Windows): read
    // them a few at a time so a refresh of dozens of repositories takes seconds.
    let agents = Mutex::new(HashMap::new());
    let next = AtomicUsize::new(0);
    let done: Vec<Mutex<Option<RepoSync>>> = jobs.iter().map(|_| Mutex::new(None)).collect();
    std::thread::scope(|scope| {
        for _ in 0..PARALLEL_REPOS.min(jobs.len()) {
            scope.spawn(|| {
                loop {
                    let index = next.fetch_add(1, Ordering::Relaxed);
                    let Some(job) = jobs.get(index) else { break };
                    let result = sync_repository(&guarded, job, since, &agents);
                    *done[index]
                        .lock()
                        .unwrap_or_else(|error| error.into_inner()) = Some(result);
                }
            });
        }
    });

    let mut repos = Vec::new();
    let mut prs = Vec::new();
    let mut commits = Vec::new();
    for result in done
        .into_iter()
        .filter_map(|slot| slot.into_inner().unwrap_or_else(|error| error.into_inner()))
    {
        repos.push(result.repository);
        prs.extend(result.pull_requests);
        commits.extend(result.commits);
        warnings.extend(result.warnings);
    }
    warnings.retain(|warning| !warning.contains("GITHUB_RATE_LIMITED"));
    let data = prune(
        &json!({"user":{"login":user["login"],"name":user["name"],"avatar_url":user["avatar_url"]},"repositories":repos,"pull_requests":prs,"commits":commits,"warnings":warnings}),
        since,
    );
    if guarded.is_blocked() {
        let reset = quota_reset(guarded.inner, u64::MAX).unwrap_or(now + COOLDOWN_SECS);
        return Ok(Synced::Limited(data, reset.max(now + 60)));
    }
    Ok(Synced::Complete(data))
}

/// One repository to sync, with what was saved for it.
struct RepoJob {
    name: String,
    repo: Value,
    /// `pushed_at` did not move since the last sync.
    unchanged: bool,
    saved_prs: Option<Vec<Value>>,
    saved_commits: Vec<Value>,
}

/// What one repository adds to the workspace.
struct RepoSync {
    repository: Value,
    pull_requests: Vec<Value>,
    commits: Vec<Value>,
    warnings: Vec<String>,
}

fn sync_repository(
    guarded: &RateGuard<'_>,
    job: &RepoJob,
    since: &str,
    agents: &Mutex<HashMap<&'static str, Option<String>>>,
) -> RepoSync {
    let gh: &dyn GhClient = guarded;
    let RepoJob { name, repo, .. } = job;
    let mut warnings = Vec::new();
    let pushed_at = text(repo, "pushed_at");
    let repository = json!({"name":name,"url":repo["html_url"],"description":repo["description"],"language":repo["language"],"private":repo["private"],"stars":repo["stargazers_count"],"pushed_at":repo["pushed_at"]});
    let watermark = job
        .saved_prs
        .as_ref()
        .and_then(|items| items.iter().map(|pr| text(pr, "updated_at")).max());

    // Pull requests: everything the first time, only what changed afterwards.
    let fetched = match &watermark {
        None => pages(
            gh,
            &format!("repos/{name}/pulls?state=all&sort=updated&direction=desc&per_page=100"),
        ),
        Some(mark) => changed_pulls(gh, name, mark),
    };
    let mut merged: Vec<Value> = job.saved_prs.clone().unwrap_or_default();
    match fetched {
        Ok(pulls) => {
            let stats = if pulls.is_empty() {
                HashMap::new()
            } else {
                pr_stats(guarded.inner, name, watermark.as_deref().unwrap_or(since))
            };
            for pr in pulls {
                let Some(number) = pr["number"].as_u64().filter(|n| *n > 0) else {
                    warnings.push(format!("{name}: INVALID_PR"));
                    continue;
                };
                let mut item = pull_request(gh, name, number, &pr, since, &mut warnings);
                if let Some(stat) = stats.get(&number) {
                    item["additions"] = stat["additions"].clone();
                    item["deletions"] = stat["deletions"].clone();
                    item["comments"] = stat["comments"].clone();
                }
                let known = merged
                    .iter()
                    .any(|old| old["number"].as_u64() == Some(number));
                if guarded.is_blocked() && known {
                    // Reviews could not be read: keep the saved copy intact.
                    continue;
                }
                merged.retain(|old| old["number"].as_u64() != Some(number));
                merged.push(item);
            }
        }
        Err(_) if guarded.is_blocked() => {}
        Err(error) if is_blocked(&error) => {}
        Err(error) => warnings.push(format!("{name}: {error}")),
    }
    merged.sort_by_key(|pr| std::cmp::Reverse(text(pr, "updated_at")));

    // Commits: only when the repository received a push since the last sync.
    let previous = &job.saved_commits;
    let mut commits = Vec::new();
    if job.unchanged
        && !pushed_at.is_empty()
        && previous
            .iter()
            .all(|commit| !commit["author"].is_null() && commit["agent"].is_string())
    {
        commits.extend(previous.iter().cloned());
    } else {
        match pages(
            gh,
            &format!("repos/{name}/commits?since={since}&per_page=100"),
        ) {
            Ok(items) => {
                for commit in items {
                    let mut author = commit["author"]["login"]
                        .as_str()
                        .filter(|name| !name.trim().is_empty())
                        .or_else(|| commit["commit"]["author"]["name"].as_str())
                        .or_else(|| commit["commit"]["committer"]["name"].as_str())
                        .map(str::to_string);
                    let mut avatar = commit["author"]["avatar_url"].clone();
                    // Work co-authored by a coding agent is credited to the agent's account.
                    let agent = agent_co_author(commit["commit"]["message"].as_str().unwrap_or(""));
                    if let Some(login) = agent {
                        author = Some(login.to_string());
                        avatar = agents
                            .lock()
                            .unwrap_or_else(|error| error.into_inner())
                            .entry(login)
                            .or_insert_with(|| agent_avatar(gh, login))
                            .clone()
                            .map_or(Value::Null, Value::String);
                    }
                    commits.push(json!({"repository":name,"sha":commit["sha"],"at":commit["commit"]["author"]["date"],"author":author,"avatar_url":avatar,"agent":agent.unwrap_or("")}));
                }
            }
            Err(_) if guarded.is_blocked() => commits.extend(previous.iter().cloned()),
            Err(error) => {
                commits.extend(previous.iter().cloned());
                if !is_blocked(&error) {
                    warnings.push(format!("{name}: {error}"));
                }
            }
        }
    }
    RepoSync {
        repository,
        pull_requests: merged,
        commits,
        warnings,
    }
}

/// Pages of pull requests updated after `mark`, newest first.
fn changed_pulls(gh: &dyn GhClient, name: &str, mark: &str) -> Result<Vec<Value>, String> {
    let mut changed = Vec::new();
    for number in 1..=MAX_PAGES {
        let items = page(
            gh,
            &format!(
                "repos/{name}/pulls?state=all&sort=updated&direction=desc&per_page=100&page={number}"
            ),
        )?;
        let full = items.len() == 100;
        let mut reached = false;
        for pr in items {
            if text(&pr, "updated_at").as_str() <= mark {
                reached = true;
                break;
            }
            changed.push(pr);
        }
        if reached || !full {
            break;
        }
    }
    Ok(changed)
}

fn pull_request(
    gh: &dyn GhClient,
    name: &str,
    number: u64,
    pr: &Value,
    since: &str,
    warnings: &mut Vec<String>,
) -> Value {
    let mut review = "none";
    let mut first_review: Option<String> = None;
    if text(pr, "updated_at").as_str() >= since {
        match pages_with_cache(
            gh,
            &format!("repos/{name}/pulls/{number}/reviews?per_page=100"),
            if pr["state"] == "closed" { "24h" } else { "5m" },
        ) {
            Ok(mut reviews) => {
                reviews.sort_by_key(|item| text(item, "submitted_at"));
                for entry in reviews {
                    let at = text(&entry, "submitted_at");
                    if at.is_empty() || entry["user"]["login"] == pr["user"]["login"] {
                        continue;
                    }
                    if first_review.is_none() {
                        first_review = Some(at);
                    }
                    match entry["state"].as_str() {
                        Some("APPROVED") => review = "approved",
                        Some("CHANGES_REQUESTED") => review = "changes_requested",
                        Some("DISMISSED") => review = "none",
                        _ => {}
                    }
                }
            }
            Err(error) => warnings.push(format!("{name}#{number}: {error}")),
        }
    }
    let state = if pr["merged_at"].is_string() {
        "merged"
    } else if pr["state"] == "closed" {
        "closed"
    } else if review != "none"
        || pr["requested_reviewers"]
            .as_array()
            .is_some_and(|r| !r.is_empty())
    {
        "review"
    } else {
        "open"
    };
    json!({"id":format!("{name}#{number}"),"repository":name,"number":number,"title":crate::redact::redact(&text(pr,"title")),"url":pr["html_url"],"state":state,"review":review,"draft":pr["draft"].as_bool().unwrap_or(false),"branch":pr["head"]["ref"],"author":pr["user"]["login"],"avatar_url":pr["user"]["avatar_url"],"created_at":pr["created_at"],"updated_at":pr["updated_at"],"merged_at":pr["merged_at"],"first_review_at":first_review})
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::github::{GhError, is_read_only};

    #[test]
    fn stops_network_calls_after_rate_limit() {
        struct Limited(AtomicUsize);
        impl GhClient for Limited {
            fn run(&self, _: &[&str]) -> Result<String, GhError> {
                self.0.fetch_add(1, Ordering::Relaxed);
                Err(GhError::Failed("API rate limit exceeded (HTTP 403)".into()))
            }
        }
        let inner = Limited(AtomicUsize::new(0));
        let guard = RateGuard {
            inner: &inner,
            blocked: AtomicBool::new(false),
        };
        assert!(guard.run(&["api", "user"]).is_err());
        assert!(guard.run(&["api", "user/repos"]).is_err());
        assert_eq!(inner.0.load(Ordering::Relaxed), 1);
    }

    struct Fixture {
        calls: Mutex<Vec<String>>,
    }
    #[test]
    fn commit_without_github_account_keeps_git_author_name() {
        struct Unlinked(Fixture);
        impl GhClient for Unlinked {
            fn run(&self, args: &[&str]) -> Result<String, GhError> {
                if args.get(1).is_some_and(|route| route.contains("/commits?")) {
                    return Ok(r#"[[{"sha":"unlinked","author":null,"commit":{"author":{"name":"A real Git author","date":"2026-11-11T10:00:00Z"}}}]]"#.into());
                }
                self.0.run(args)
            }
        }
        let data = load(
            &Unlinked(Fixture {
                calls: Mutex::new(Vec::new()),
            }),
            "2026-11-01T00:00:00Z",
        )
        .unwrap();
        assert_eq!(data["commits"][0]["author"], "A real Git author");
    }
    #[test]
    fn agent_co_authored_commits_are_credited_to_the_agent_account() {
        struct Agents(Fixture);
        impl GhClient for Agents {
            fn run(&self, args: &[&str]) -> Result<String, GhError> {
                let route = args.get(1).copied().unwrap_or_default();
                if route.contains("/commits?") {
                    return Ok(r#"[[
                        {"sha":"a","author":{"login":"owner","avatar_url":"https://avatars.githubusercontent.com/u/1"},"commit":{"message":"Fix\n\nCo-authored-by: Codex <noreply@openai.com>","author":{"date":"2026-11-11T10:00:00Z"}}},
                        {"sha":"b","author":{"login":"owner","avatar_url":"https://avatars.githubusercontent.com/u/1"},"commit":{"message":"Add\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>","author":{"date":"2026-11-11T11:00:00Z"}}},
                        {"sha":"c","author":{"login":"owner","avatar_url":"https://avatars.githubusercontent.com/u/1"},"commit":{"message":"Solo\n\nCo-authored-by: Friend <friend@example.com>","author":{"date":"2026-11-11T12:00:00Z"}}}
                    ]]"#.into());
                }
                if route == "users/codex" {
                    return Ok(r#"{"login":"codex","avatar_url":"https://avatars.githubusercontent.com/u/267193182?v=4"}"#.into());
                }
                if route == "users/claude" {
                    return Ok(r#"{"login":"claude","avatar_url":"https://avatars.githubusercontent.com/u/81847?v=4"}"#.into());
                }
                self.0.run(args)
            }
        }
        let data = load(
            &Agents(Fixture {
                calls: Mutex::new(Vec::new()),
            }),
            "2026-11-01T00:00:00Z",
        )
        .unwrap();
        let commit = |sha: &str| {
            data["commits"]
                .as_array()
                .unwrap()
                .iter()
                .find(|commit| commit["sha"] == sha)
                .unwrap()
                .clone()
        };
        assert_eq!(commit("a")["author"], "codex");
        assert_eq!(
            commit("a")["avatar_url"],
            "https://avatars.githubusercontent.com/u/267193182?v=4"
        );
        assert_eq!(commit("b")["author"], "claude");
        assert_eq!(
            commit("b")["avatar_url"],
            "https://avatars.githubusercontent.com/u/81847?v=4"
        );
        // Human co-authors do not move the credit away from the author.
        assert_eq!(commit("c")["author"], "owner");
        assert_eq!(commit("c")["agent"], "");
    }
    impl GhClient for Fixture {
        fn run(&self, args: &[&str]) -> Result<String, GhError> {
            assert!(is_read_only(args));
            self.calls.lock().unwrap().push(args.join(" "));
            let route = args[1];
            let json = if args[0] == "pr" {
                if args[3] == "owner/remote" {
                    r#"[{"number":1,"additions":10,"deletions":2,"comments":3}]"#
                } else {
                    "[]"
                }
            } else if route == "rate_limit" {
                r#"{"resources":{"core":{"remaining":5000,"reset":0}}}"#
            } else if route == "user" {
                r#"{"login":"owner","name":"Real user","avatar_url":"https://avatars.githubusercontent.com/u/1"}"#
            } else if route.starts_with("user/repos?") {
                r#"[[{"full_name":"owner/remote","html_url":"https://github.com/owner/remote","description":"remote only","language":"Rust","private":true,"stargazers_count":7,"pushed_at":"2026-11-11T10:00:00Z"}],[{"full_name":"team/second","html_url":"https://github.com/team/second","private":false,"stargazers_count":2}]]"#
            } else if route.starts_with("repos/owner/remote/pulls?") {
                r#"[[{"number":1,"title":"Open PR","state":"open","html_url":"https://github.com/owner/remote/pull/1","created_at":"2026-11-10T10:00:00Z","updated_at":"2026-11-11T10:00:00Z","merged_at":null,"head":{"ref":"branch"},"user":{"login":"contributor","avatar_url":"https://avatars.githubusercontent.com/u/2"}}],[{"number":2,"title":"Merged PR","state":"closed","html_url":"https://github.com/owner/remote/pull/2","created_at":"2026-11-09T10:00:00Z","updated_at":"2026-11-10T12:00:00Z","merged_at":"2026-11-10T12:00:00Z","user":{"login":"owner"}}]]"#
            } else if route.starts_with("repos/team/second/pulls?") {
                r#"[[{"number":1,"title":"Closed PR","state":"closed","html_url":"https://github.com/team/second/pull/1","created_at":"2020-01-01T00:00:00Z","updated_at":"2020-01-01T00:00:00Z","merged_at":null}]]"#
            } else if route.contains("/commits?") {
                r#"[[{"sha":"stable","author":{"login":"owner","avatar_url":"https://avatars.githubusercontent.com/u/1"},"commit":{"author":{"date":"2026-11-11T10:00:00Z"}}}]]"#
            } else if route.ends_with("/reviews?per_page=100") {
                r#"[[{"state":"APPROVED","submitted_at":"2026-11-10T12:00:00Z","user":{"login":"reviewer"}}]]"#
            } else {
                panic!("unexpected read route: {route}")
            };
            if !args.contains(&"--slurp") && json.starts_with("[[") {
                let outer: Vec<Vec<Value>> = serde_json::from_str(json).unwrap();
                return Ok(serde_json::to_string(&outer.concat()).unwrap());
            }
            Ok(json.into())
        }
    }
    #[test]
    fn remote_repos_and_full_pr_history_do_not_require_local_projects() {
        let gh = Fixture {
            calls: Mutex::new(Vec::new()),
        };
        let data = load(&gh, "2026-09-01T00:00:00Z").unwrap();
        assert_eq!(data["repositories"].as_array().unwrap().len(), 2);
        assert_eq!(data["pull_requests"].as_array().unwrap().len(), 3);
        assert_eq!(data["repositories"][0]["stars"], 7);
        assert_eq!(data["pull_requests"][1]["state"], "merged");
        assert_eq!(data["pull_requests"][0]["additions"], 10);
        assert_eq!(data["pull_requests"][0]["comments"], 3);
        assert_eq!(data["pull_requests"][2]["state"], "closed");
        assert_eq!(
            data["pull_requests"][0]["first_review_at"],
            "2026-11-10T12:00:00Z"
        );
        let calls = gh.calls.lock().unwrap();
        assert!(calls.iter().any(|c| c.contains("state=all")));
        assert!(
            calls
                .iter()
                .filter(|c| c.contains("pulls?"))
                .all(|c| c.contains("--paginate --slurp"))
        );
        assert_eq!(data["warnings"].as_array().unwrap().len(), 0);
    }
    #[test]
    fn malformed_account_is_an_error_not_an_empty_connected_workspace() {
        struct Invalid;
        impl GhClient for Invalid {
            fn run(&self, _args: &[&str]) -> Result<String, GhError> {
                Ok("{}".into())
            }
        }
        assert!(load(&Invalid, "2026-09-01T00:00:00Z").is_err());
    }

    #[test]
    fn second_sync_only_reads_what_changed() {
        let since = "2026-09-01T00:00:00Z";
        let first = Fixture {
            calls: Mutex::new(Vec::new()),
        };
        let data = load(&first, since).unwrap();
        let second = Fixture {
            calls: Mutex::new(Vec::new()),
        };
        let envelope = json!({"at":0,"data":data});
        let (value, write) = decide(&second, since, &envelope, 1_000_000);
        let value = value.unwrap();
        assert_eq!(value["pull_requests"].as_array().unwrap().len(), 3);
        assert_eq!(
            value["pull_requests"][0]["first_review_at"],
            "2026-11-10T12:00:00Z"
        );
        assert_eq!(value["commits"].as_array().unwrap().len(), 2);
        assert!(write.is_some());
        let calls = second.calls.lock().unwrap();
        assert!(!calls.iter().any(|c| c.contains("/reviews")), "{calls:?}");
        // owner/remote was not pushed again: its commits come from the cache.
        assert!(
            !calls.iter().any(|c| c.contains("owner/remote/commits")),
            "{calls:?}"
        );
        assert!(
            calls
                .iter()
                .filter(|c| c.contains("pulls?"))
                .all(|c| c.contains("&page=1") && !c.contains("--paginate"))
        );
    }

    #[test]
    fn fresh_cache_makes_no_calls() {
        struct Forbidden;
        impl GhClient for Forbidden {
            fn run(&self, args: &[&str]) -> Result<String, GhError> {
                panic!("unexpected call: {args:?}")
            }
        }
        let envelope =
            json!({"at":1000,"data":{"repositories":[],"pull_requests":[],"commits":[]}});
        let (value, write) = decide(&Forbidden, "2026-09-01T00:00:00Z", &envelope, 1000 + 60);
        assert!(value.is_ok());
        assert!(write.is_none());
    }

    #[test]
    fn rate_limit_keeps_saved_data_and_waits_until_reset() {
        struct Spent;
        impl GhClient for Spent {
            fn run(&self, args: &[&str]) -> Result<String, GhError> {
                if args == ["api", "rate_limit"] {
                    return Ok(r#"{"resources":{"core":{"remaining":0,"reset":5000}}}"#.into());
                }
                panic!("no call may be spent: {args:?}")
            }
        }
        let saved = json!({"repositories":[{"name":"owner/remote"}],"pull_requests":[{"id":"owner/remote#1"}],"commits":[]});
        let envelope = json!({"at":0,"data":saved});
        let (value, write) = decide(&Spent, "2026-09-01T00:00:00Z", &envelope, 1000);
        let value = value.unwrap();
        assert_eq!(value["repositories"].as_array().unwrap().len(), 1);
        assert_eq!(value["rate_limited_until"], 5000);
        let write = write.unwrap();
        assert_eq!(write["blocked_until"], 5000);

        struct Forbidden;
        impl GhClient for Forbidden {
            fn run(&self, args: &[&str]) -> Result<String, GhError> {
                panic!("blocked until reset: {args:?}")
            }
        }
        let (value, write) = decide(&Forbidden, "2026-09-01T00:00:00Z", &write, 2000);
        assert_eq!(value.unwrap()["rate_limited_until"], 5000);
        assert!(write.is_none());
    }

    #[test]
    fn rate_limit_mid_sync_keeps_saved_repositories() {
        struct Midway(AtomicUsize);
        impl GhClient for Midway {
            fn run(&self, args: &[&str]) -> Result<String, GhError> {
                match args[1] {
                    "rate_limit" => {
                        Ok(r#"{"resources":{"core":{"remaining":100,"reset":9000}}}"#.into())
                    }
                    "user" => Ok(r#"{"login":"owner"}"#.into()),
                    route if route.starts_with("user/repos?") => Ok(
                        r#"[[{"full_name":"owner/remote","pushed_at":"2026-11-12T00:00:00Z"}]]"#
                            .into(),
                    ),
                    _ => {
                        self.0.fetch_add(1, Ordering::Relaxed);
                        Err(GhError::Failed("API rate limit exceeded".into()))
                    }
                }
            }
        }
        let saved = json!({
            "repositories":[{"name":"owner/remote","pushed_at":"2026-11-11T00:00:00Z"}],
            "pull_requests":[{"id":"owner/remote#1","repository":"owner/remote","number":1,"updated_at":"2026-11-10T00:00:00Z"}],
            "commits":[{"repository":"owner/remote","sha":"a","at":"2026-11-10T00:00:00Z"}]
        });
        let gh = Midway(AtomicUsize::new(0));
        let (value, write) = decide(
            &gh,
            "2026-09-01T00:00:00Z",
            &json!({"at":0,"data":saved}),
            1000,
        );
        let value = value.unwrap();
        assert_eq!(
            gh.0.load(Ordering::Relaxed),
            1,
            "stops after the first limited call"
        );
        assert_eq!(value["pull_requests"].as_array().unwrap().len(), 1);
        assert_eq!(value["commits"].as_array().unwrap().len(), 1);
        assert_eq!(value["warnings"].as_array().unwrap().len(), 0);
        assert!(write.unwrap()["blocked_until"].as_u64().unwrap() > 1000);
    }

    #[test]
    fn repositories_are_read_in_parallel_and_keep_their_order() {
        struct Slow {
            running: AtomicUsize,
            peak: AtomicUsize,
        }
        impl GhClient for Slow {
            fn run(&self, args: &[&str]) -> Result<String, GhError> {
                let route = args[1];
                if route == "rate_limit" {
                    return Ok(r#"{"resources":{"core":{"remaining":5000,"reset":0}}}"#.into());
                }
                if route == "user" {
                    return Ok(r#"{"login":"owner"}"#.into());
                }
                if route.starts_with("user/repos?") {
                    let repos: Vec<Value> = (0..16)
                        .map(|i| json!({"full_name":format!("owner/r{i:02}"),"pushed_at":"2026-11-11T00:00:00Z"}))
                        .collect();
                    return Ok(json!([repos]).to_string());
                }
                let now = self.running.fetch_add(1, Ordering::SeqCst) + 1;
                self.peak.fetch_max(now, Ordering::SeqCst);
                std::thread::sleep(std::time::Duration::from_millis(20));
                self.running.fetch_sub(1, Ordering::SeqCst);
                let name = route.split('/').nth(2).unwrap_or_default();
                if route.contains("/pulls?") {
                    // One unchanged pull request per repository.
                    return Ok(json!([{"number":1,"updated_at":format!("2026-11-10T00:00:{}Z", &name[1..])}]).to_string());
                }
                Ok("[]".into())
            }
        }
        let saved = json!({
            "repositories": (0..16).map(|i| json!({"name":format!("owner/r{i:02}"),"pushed_at":"2026-11-11T00:00:00Z"})).collect::<Vec<_>>(),
            "pull_requests": (0..16).map(|i| json!({"repository":format!("owner/r{i:02}"),"number":1,"updated_at":format!("2026-11-10T00:00:{i:02}Z")})).collect::<Vec<_>>(),
            "commits": [],
        });
        let gh = Slow {
            running: AtomicUsize::new(0),
            peak: AtomicUsize::new(0),
        };
        let (value, _) = decide(
            &gh,
            "2026-09-01T00:00:00Z",
            &json!({"at":0,"data":saved}),
            1000,
        );
        let value = value.unwrap();
        assert!(
            gh.peak.load(Ordering::SeqCst) > 1,
            "repositories read one by one"
        );
        let order = |key: &str, field: &str| -> Vec<String> {
            value[key]
                .as_array()
                .unwrap()
                .iter()
                .map(|item| text(item, field))
                .collect()
        };
        let expected: Vec<String> = (0..16).map(|i| format!("owner/r{i:02}")).collect();
        assert_eq!(order("repositories", "name"), expected);
        assert_eq!(order("pull_requests", "repository"), expected);
    }
}
