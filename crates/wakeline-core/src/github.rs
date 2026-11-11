//! Fuente GitHub: issues, PRs, revisiones y CI con la sesión de `gh` (Q48, Q53, Q56 a Q58).
//!
//! Solo lectura: [`SystemGh`] rechaza cualquier llamada que no sea una consulta. Wakeline
//! nunca lanza `gh auth login` ni toca tokens; si `gh` no está o no tiene sesión, esta
//! fuente simplemente no aporta nada.

use std::collections::HashMap;
use std::io;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde::{Deserialize, Serialize};

use crate::card::{CardKind, SourceKind};
use crate::commands::exec::resolve_program;
use crate::commands::parsers::parse_ci_log;
use crate::fingerprint::Fingerprint;
use crate::redact::redact;
use crate::store::LocalState;
use crate::watch::normalized_path;

/// Máximo de issues y de PRs abiertos que se leen. Si se llega al tope, la lectura no
/// cuenta como completa y no cierra nada (Q54).
pub const LIST_LIMIT: usize = 100;
/// Cada cuánto se consulta GitHub con la app o `wakeline watch` abiertos.
pub const POLL_SECS: u64 = 60;
/// Un PR abierto más tiempo que esto genera una Tarea (Q48).
pub const STALE_PR_DAYS: u64 = 7;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GhError {
    NotInstalled,
    Failed(String),
}

impl std::fmt::Display for GhError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotInstalled => f.write_str("gh no está instalado"),
            Self::Failed(message) => f.write_str(message),
        }
    }
}

/// Quien ejecuta `gh`. En las pruebas se cambia por respuestas simuladas.
pub trait GhClient {
    fn run(&self, args: &[&str]) -> Result<String, GhError>;
}

/// `gh` del sistema, sin shell y sin ventana, solo con consultas.
pub struct SystemGh;

impl GhClient for SystemGh {
    fn run(&self, args: &[&str]) -> Result<String, GhError> {
        if !is_read_only(args) {
            return Err(GhError::Failed(format!(
                "llamada a gh no permitida: {args:?}"
            )));
        }
        let program = resolve_program("gh", Path::new(".")).ok_or(GhError::NotInstalled)?;
        let mut command = Command::new(program);
        command
            .args(args)
            .env("GH_PROMPT_DISABLED", "1")
            .env("NO_COLOR", "1")
            .stdin(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            command.creation_flags(CREATE_NO_WINDOW);
        }
        let output = command.output().map_err(|error| match error.kind() {
            io::ErrorKind::NotFound => GhError::NotInstalled,
            _ => GhError::Failed(error.to_string()),
        })?;
        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).into_owned())
        } else {
            Err(GhError::Failed(
                String::from_utf8_lossy(&output.stderr).trim().to_string(),
            ))
        }
    }
}

/// Solo consultas: listar issues y PRs, ver runs y leer la API con GET.
pub fn is_read_only(args: &[&str]) -> bool {
    match args {
        ["issue" | "pr", "list", ..] | ["run", "view", ..] => true,
        ["api", rest @ ..] => !rest.iter().any(|arg| {
            matches!(
                *arg,
                "-X" | "--method" | "-f" | "-F" | "--field" | "--raw-field" | "--input"
            ) || arg.starts_with("--method=")
                || arg.starts_with("-X")
        }),
        _ => false,
    }
}

/// Estado de `gh` para mostrarlo en Configuración (Q65).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum GhStatus {
    NotInstalled,
    NotLoggedIn,
    Connected { login: String },
}

pub fn status(gh: &dyn GhClient) -> GhStatus {
    match gh.run(&["api", "user", "--jq", ".login"]) {
        Ok(login) => GhStatus::Connected {
            login: login.trim().to_string(),
        },
        Err(GhError::NotInstalled) => GhStatus::NotInstalled,
        Err(GhError::Failed(_)) => GhStatus::NotLoggedIn,
    }
}

/// `owner/repo` del remoto `origin` si está en github.com.
pub fn github_repo(project_root: &Path) -> Option<String> {
    let mut git_dir = project_root.join(".git");
    if git_dir.is_file() {
        let pointer = std::fs::read_to_string(&git_dir).ok()?;
        git_dir = project_root.join(pointer.trim().strip_prefix("gitdir:")?.trim());
    }
    if let Ok(common) = std::fs::read_to_string(git_dir.join("commondir")) {
        git_dir = git_dir.join(common.trim());
    }
    let config = std::fs::read_to_string(git_dir.join("config")).ok()?;
    let mut in_origin = false;
    for line in config.lines().map(str::trim) {
        if line.starts_with('[') {
            in_origin = line == "[remote \"origin\"]";
        } else if in_origin
            && let Some(url) = line.strip_prefix("url").map(str::trim_start)
            && let Some(url) = url.strip_prefix('=')
        {
            return parse_remote(url.trim());
        }
    }
    None
}

/// `https://github.com/o/r(.git)`, `git@github.com:o/r.git` o `ssh://git@github.com/o/r`.
pub fn parse_remote(url: &str) -> Option<String> {
    let rest = url
        .strip_prefix("https://github.com/")
        .or_else(|| url.strip_prefix("http://github.com/"))
        .or_else(|| url.strip_prefix("git@github.com:"))
        .or_else(|| url.strip_prefix("ssh://git@github.com/"))?;
    let rest = rest.trim_end_matches('/');
    let rest = rest.strip_suffix(".git").unwrap_or(rest);
    let (owner, repo) = rest.split_once('/')?;
    let valid = |s: &str| {
        !s.is_empty()
            && s.chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
    };
    (valid(owner) && valid(repo)).then(|| format!("{owner}/{repo}"))
}

/// Una tarjeta que sale de GitHub.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GithubCard {
    pub fingerprint: Fingerprint,
    pub kind: CardKind,
    pub source: SourceKind,
    /// Clave de la etiqueta de origen: `issue`, `review`, `pr` o `ci` (la traduce la interfaz).
    pub label: String,
    pub title: String,
    pub url: String,
    pub branch: Option<String>,
    /// Ruta relativa al proyecto, solo para errores del CI que se pudieron leer.
    pub path: Option<String>,
    pub line: Option<usize>,
    pub occurrences: u32,
}

impl GithubCard {
    pub fn location(&self) -> String {
        match (&self.path, self.line) {
            (Some(path), Some(line)) => format!("{path}:{line}"),
            (Some(path), None) => path.clone(),
            _ => self.url.clone(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CiState {
    Passing,
    Failing,
    Pending,
    None,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewState {
    Approved,
    ChangesRequested,
    None,
}

/// Resumen de un PR abierto para la vista «Pull requests».
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PullRequestInfo {
    pub number: u64,
    pub title: String,
    pub url: String,
    pub branch: String,
    pub draft: bool,
    pub age_days: u64,
    pub ci: CiState,
    pub review: ReviewState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullRequestFile {
    pub filename: String,
    pub additions: u64,
    pub deletions: u64,
    pub patch: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullRequestDetails {
    pub body: String,
    pub files: Vec<PullRequestFile>,
}

pub fn fetch_pr_details(
    gh: &dyn GhClient,
    repo: &str,
    number: u64,
) -> Result<PullRequestDetails, GhError> {
    if parse_remote(&format!("https://github.com/{repo}")).as_deref() != Some(repo) || number == 0 {
        return Err(GhError::Failed("PR no válido".into()));
    }
    let endpoint = format!("repos/{repo}/pulls/{number}");
    #[derive(Deserialize)]
    struct Description {
        body: Option<String>,
    }
    let description: Description = parse_json(gh.run(&["api", &endpoint, "--jq", "{body}"])?)?;
    // Filter excluded patches inside gh before they reach the application.
    let filter = r#"map(select((.filename | ascii_downcase | test("(^|/)\\.env($|\\.)|(^|/)opencode\\.db$|(^|/)\\.claude/sessions(/|$)")) | not))"#;
    let response = gh.run(&[
        "api",
        &format!("{endpoint}/files?per_page=100"),
        "--paginate",
        "--jq",
        filter,
    ])?;
    let pages: Vec<Vec<PullRequestFile>> = serde_json::Deserializer::from_str(&response)
        .into_iter::<Vec<PullRequestFile>>()
        .collect::<Result<_, _>>()
        .map_err(|error| GhError::Failed(format!("respuesta de gh no válida: {error}")))?;
    let files = pages
        .into_iter()
        .flatten()
        .filter(|file| !crate::exclusions::is_excluded(Path::new(&file.filename)))
        .map(|mut file| {
            file.patch = file
                .patch
                .map(|patch| patch.lines().map(redact).collect::<Vec<_>>().join("\n"));
            file
        })
        .collect();
    Ok(PullRequestDetails {
        body: description
            .body
            .unwrap_or_default()
            .lines()
            .map(redact)
            .collect::<Vec<_>>()
            .join("\n"),
        files,
    })
}

/// Lo leído de GitHub para un proyecto.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GithubSnapshot {
    pub repo: String,
    pub fetched_at: u64,
    /// Se leyó todo sin errores ni topes: puede cerrar tarjetas (Q54).
    pub complete: bool,
    pub cards: Vec<GithubCard>,
    pub pull_requests: Vec<PullRequestInfo>,
}

#[derive(Deserialize)]
struct IssueJson {
    number: u64,
    title: String,
    url: String,
    #[serde(default)]
    labels: Vec<LabelJson>,
}

#[derive(Deserialize)]
struct LabelJson {
    name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrJson {
    number: u64,
    title: String,
    url: String,
    head_ref_name: String,
    created_at: String,
    #[serde(default)]
    is_draft: bool,
    #[serde(default)]
    latest_reviews: Vec<ReviewJson>,
    #[serde(default)]
    status_check_rollup: Vec<CheckJson>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReviewJson {
    author: Option<AuthorJson>,
    state: String,
}

#[derive(Deserialize)]
struct AuthorJson {
    login: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CheckJson {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    context: Option<String>,
    #[serde(default)]
    workflow_name: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    conclusion: Option<String>,
    /// En `StatusContext` el resultado va en `state`.
    #[serde(default)]
    state: Option<String>,
    #[serde(default)]
    details_url: Option<String>,
    #[serde(default)]
    target_url: Option<String>,
}

impl CheckJson {
    fn failed(&self) -> bool {
        let result = self
            .conclusion
            .as_deref()
            .or(self.state.as_deref())
            .unwrap_or("")
            .to_ascii_uppercase();
        matches!(
            result.as_str(),
            "FAILURE" | "ERROR" | "TIMED_OUT" | "CANCELLED" | "STARTUP_FAILURE"
        )
    }

    fn pending(&self) -> bool {
        let status = self.status.as_deref().unwrap_or("").to_ascii_uppercase();
        let state = self.state.as_deref().unwrap_or("").to_ascii_uppercase();
        matches!(
            status.as_str(),
            "QUEUED" | "IN_PROGRESS" | "PENDING" | "WAITING"
        ) || state == "PENDING"
    }

    fn name(&self) -> String {
        let job = self
            .name
            .as_deref()
            .or(self.context.as_deref())
            .unwrap_or("check");
        match &self.workflow_name {
            Some(workflow) if !workflow.is_empty() => format!("{workflow}/{job}"),
            _ => job.to_string(),
        }
    }

    fn url(&self) -> Option<&str> {
        self.details_url.as_deref().or(self.target_url.as_deref())
    }

    /// Id del run de Actions sacado de `.../actions/runs/<id>/job/<id>`.
    fn run_id(&self) -> Option<&str> {
        let url = self.url()?;
        let rest = url.split("/actions/runs/").nth(1)?;
        let id = rest.split('/').next()?;
        (!id.is_empty() && id.chars().all(|c| c.is_ascii_digit())).then_some(id)
    }
}

thread_local! {
    /// Logs de CI fallido por `repo/run`: un run terminado no cambia, así que el
    /// sondeo de cada minuto no vuelve a descargarlo (cada descarga son varias
    /// llamadas REST). Por hilo: el del sondeo lo conserva entre lecturas.
    static CI_LOGS: std::cell::RefCell<HashMap<String, String>> = Default::default();
}

/// Lee issues, PRs, revisiones y CI rojo de un repo.
pub fn fetch(
    gh: &dyn GhClient,
    project_root: &Path,
    repo: &str,
    now: u64,
) -> Result<GithubSnapshot, GhError> {
    let limit = LIST_LIMIT.to_string();
    let issues: Vec<IssueJson> = parse_json(gh.run(&[
        "issue",
        "list",
        "--repo",
        repo,
        "--state",
        "open",
        "--limit",
        &limit,
        "--json",
        "number,title,url,labels",
    ])?)?;
    let prs: Vec<PrJson> = parse_json(gh.run(&[
        "pr",
        "list",
        "--repo",
        repo,
        "--state",
        "open",
        "--limit",
        &limit,
        "--json",
        "number,title,url,headRefName,createdAt,isDraft,latestReviews,statusCheckRollup",
    ])?)?;
    let mut complete = issues.len() < LIST_LIMIT && prs.len() < LIST_LIMIT;

    let mut cards: Vec<GithubCard> = Vec::new();
    for issue in &issues {
        push(&mut cards, issue_card(issue));
    }

    let path_roots = command_dirs(project_root);
    let mut logs: HashMap<String, Option<String>> = HashMap::new();
    let mut pull_requests = Vec::new();
    for pr in &prs {
        let age_days = unix_from_rfc3339(&pr.created_at)
            .map(|created| now.saturating_sub(created) / 86_400)
            .unwrap_or(0);
        let mut review = ReviewState::None;
        for r in &pr.latest_reviews {
            match r.state.as_str() {
                "CHANGES_REQUESTED" => {
                    review = ReviewState::ChangesRequested;
                    let login = r.author.as_ref().map_or("?", |a| a.login.as_str());
                    push(&mut cards, review_card(pr, login));
                }
                "APPROVED" if review == ReviewState::None => review = ReviewState::Approved,
                _ => {}
            }
        }
        if age_days > STALE_PR_DAYS {
            push(&mut cards, stale_card(pr));
        }

        let failed: Vec<&CheckJson> = pr
            .status_check_rollup
            .iter()
            .filter(|c| c.failed())
            .collect();
        let ci = if !failed.is_empty() {
            CiState::Failing
        } else if pr.status_check_rollup.iter().any(CheckJson::pending) {
            CiState::Pending
        } else if pr.status_check_rollup.is_empty() {
            CiState::None
        } else {
            CiState::Passing
        };
        for check in failed {
            let log = match check.run_id() {
                Some(id) => logs
                    .entry(id.to_string())
                    .or_insert_with(|| {
                        let key = format!("{repo}/{id}");
                        if let Some(log) = CI_LOGS.with(|logs| logs.borrow().get(&key).cloned()) {
                            return Some(log);
                        }
                        let log = gh.run(&["run", "view", id, "--repo", repo, "--log-failed"]);
                        if log.is_err() {
                            complete = false;
                        }
                        let log = log.ok().map(|text| clean_log(&text));
                        if let Some(text) = &log {
                            CI_LOGS.with(|logs| {
                                let mut logs = logs.borrow_mut();
                                if logs.len() >= 256 {
                                    logs.clear();
                                }
                                logs.insert(key, text.clone());
                            });
                        }
                        log
                    })
                    .clone(),
                None => None,
            };
            for card in ci_cards(pr, check, log.as_deref(), project_root, &path_roots, repo) {
                push(&mut cards, card);
            }
        }

        pull_requests.push(PullRequestInfo {
            number: pr.number,
            title: pr.title.clone(),
            url: pr.url.clone(),
            branch: pr.head_ref_name.clone(),
            draft: pr.is_draft,
            age_days,
            ci,
            review,
        });
    }

    Ok(GithubSnapshot {
        repo: repo.to_string(),
        fetched_at: now,
        complete,
        cards,
        pull_requests,
    })
}

fn parse_json<T: for<'de> Deserialize<'de>>(text: String) -> Result<T, GhError> {
    serde_json::from_str(&text)
        .map_err(|error| GhError::Failed(format!("respuesta de gh no válida: {error}")))
}

fn push(cards: &mut Vec<GithubCard>, card: GithubCard) {
    match cards.iter_mut().find(|c| c.fingerprint == card.fingerprint) {
        Some(existing) => existing.occurrences += 1,
        None => cards.push(card),
    }
}

/// `bug` → Error; `enhancement` → Idea; resto → Tarea.
fn issue_card(issue: &IssueJson) -> GithubCard {
    let has = |name: &str| {
        issue
            .labels
            .iter()
            .any(|l| l.name.eq_ignore_ascii_case(name))
    };
    let kind = if has("bug") {
        CardKind::Error
    } else if has("enhancement") {
        CardKind::Idea
    } else {
        CardKind::Task
    };
    let title = redact(&format!("#{} {}", issue.number, issue.title));
    GithubCard {
        fingerprint: Fingerprint::new(kind, SourceKind::Issue, Some(&issue.url), &title),
        kind,
        source: SourceKind::Issue,
        label: "issue".into(),
        title,
        url: issue.url.clone(),
        branch: None,
        path: None,
        line: None,
        occurrences: 1,
    }
}

fn review_card(pr: &PrJson, login: &str) -> GithubCard {
    let title = redact(&format!(
        "Cambios pedidos por @{login} en PR #{}: {}",
        pr.number, pr.title
    ));
    GithubCard {
        fingerprint: Fingerprint::new(
            CardKind::Task,
            SourceKind::PullRequest,
            Some(&pr.url),
            &title,
        ),
        kind: CardKind::Task,
        source: SourceKind::PullRequest,
        label: "review".into(),
        title,
        url: pr.url.clone(),
        branch: Some(pr.head_ref_name.clone()),
        path: None,
        line: None,
        occurrences: 1,
    }
}

fn stale_card(pr: &PrJson) -> GithubCard {
    let title = redact(&format!(
        "PR #{} abierto más de {STALE_PR_DAYS} días: {}",
        pr.number, pr.title
    ));
    GithubCard {
        fingerprint: Fingerprint::new(
            CardKind::Task,
            SourceKind::PullRequest,
            Some(&pr.url),
            &title,
        ),
        kind: CardKind::Task,
        source: SourceKind::PullRequest,
        label: "pr".into(),
        title,
        url: pr.url.clone(),
        branch: Some(pr.head_ref_name.clone()),
        path: None,
        line: None,
        occurrences: 1,
    }
}

/// Errores del log del job fallido; si no se entiende, una tarjeta «CI rojo» (Q53).
fn ci_cards(
    pr: &PrJson,
    check: &CheckJson,
    log: Option<&str>,
    project_root: &Path,
    path_roots: &[String],
    repo: &str,
) -> Vec<GithubCard> {
    let url = check.url().unwrap_or(&pr.url).to_string();
    let errors = log.map(parse_ci_log).unwrap_or_default();
    if errors.is_empty() {
        let title = format!("CI rojo: {} en {}", check.name(), pr.head_ref_name);
        return vec![GithubCard {
            fingerprint: Fingerprint::new(CardKind::Error, SourceKind::PullRequest, None, &title),
            kind: CardKind::Error,
            source: SourceKind::PullRequest,
            label: "ci".into(),
            title,
            url,
            branch: Some(pr.head_ref_name.clone()),
            path: None,
            line: None,
            occurrences: 1,
        }];
    }
    let repo_name = repo.rsplit('/').next().unwrap_or(repo);
    errors
        .into_iter()
        .map(|error| {
            let path = error
                .path
                .as_deref()
                .map(|p| resolve_ci_path(project_root, path_roots, repo_name, p));
            let title = redact(&error.message);
            GithubCard {
                fingerprint: Fingerprint::new(
                    CardKind::Error,
                    SourceKind::PullRequest,
                    path.as_deref(),
                    &title,
                ),
                kind: CardKind::Error,
                source: SourceKind::PullRequest,
                label: "ci".into(),
                title,
                url: url.clone(),
                branch: Some(pr.head_ref_name.clone()),
                path,
                line: error.line,
                occurrences: 1,
            }
        })
        .collect()
}

/// Lleva una ruta del CI a la forma relativa al proyecto que usan los comandos locales.
///
/// Quita la carpeta de trabajo del runner (`D:\a\repo\repo\`, `/home/runner/work/repo/repo/`)
/// y, si la ruta no existe tal cual, la prueba dentro de los `cwd` de `wakeline.toml`:
/// el CI suele correr la herramienta en la misma subcarpeta.
fn resolve_ci_path(
    project_root: &Path,
    path_roots: &[String],
    repo_name: &str,
    raw: &str,
) -> String {
    let mut path = raw.replace('\\', "/");
    let workspace = format!("/{repo_name}/{repo_name}/");
    if let Some(idx) = path.find(&workspace) {
        path = path[idx + workspace.len()..].to_string();
    }
    let path = path.trim_start_matches("./").to_string();
    if project_root.join(&path).is_file() {
        return path;
    }
    path_roots
        .iter()
        .map(|root| format!("{}/{path}", root.trim_end_matches('/')))
        .find(|candidate| project_root.join(candidate).is_file())
        .unwrap_or(path)
}

/// Carpetas `cwd` de `wakeline.toml`; solo se leen, no hace falta que esté aprobado.
fn command_dirs(project_root: &Path) -> Vec<String> {
    match crate::commands::load(project_root) {
        Ok(Some(loaded)) => loaded
            .config
            .commands
            .into_iter()
            .filter_map(|c| c.cwd)
            .collect(),
        _ => Vec::new(),
    }
}

/// Quita el prefijo `job<TAB>paso<TAB>hora ` de cada línea y los colores ANSI.
fn clean_log(log: &str) -> String {
    log.lines()
        .map(|line| {
            let content = line.splitn(3, '\t').nth(2).unwrap_or(line);
            let content = match content.split_once(' ') {
                Some((stamp, rest)) if stamp.ends_with('Z') && stamp.contains('T') => rest,
                _ => content,
            };
            strip_ansi(content)
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn strip_ansi(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' && chars.peek() == Some(&'[') {
            chars.next();
            for next in chars.by_ref() {
                if next.is_ascii_alphabetic() {
                    break;
                }
            }
        } else {
            out.push(c);
        }
    }
    out
}

/// `2026-11-09T06:03:35Z` → segundos Unix.
pub fn unix_from_rfc3339(text: &str) -> Option<u64> {
    let (date, time) = text.split_once('T')?;
    let mut d = date.split('-').map(|p| p.parse::<i64>().ok());
    let (year, month, day) = (d.next()??, d.next()??, d.next()??);
    let time = time.trim_end_matches('Z');
    let time = time.split(['+', '.']).next()?;
    let mut t = time.split(':').map(|p| p.parse::<i64>().ok());
    let (hour, minute, second) = (t.next()??, t.next()??, t.next().flatten().unwrap_or(0));
    // Días desde 1970-01-01 (algoritmo de Howard Hinnant).
    let y = if month <= 2 { year - 1 } else { year };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (month + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    u64::try_from(days * 86_400 + hour * 3600 + minute * 60 + second).ok()
}

/// Último resultado de GitHub por proyecto, en `%APPDATA%\wakeline\github.json`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct GithubCache {
    #[serde(default)]
    snapshots: HashMap<String, GithubSnapshot>,
    #[serde(default)]
    errors: HashMap<String, String>,
}

pub fn cache_path() -> PathBuf {
    LocalState::default_path().with_file_name("github.json")
}

impl GithubCache {
    pub fn load(path: &Path) -> Self {
        std::fs::read_to_string(path)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, path: &Path) -> io::Result<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(self).map_err(io::Error::other)?;
        let temp = path.with_extension("json.tmp");
        std::fs::write(&temp, json)?;
        std::fs::rename(&temp, path)
    }

    /// Guarda una lectura. Si falló, se conserva la anterior: un `gh` caído no dice
    /// nada de si las cosas siguen abiertas (Q54).
    pub fn record(&mut self, project_root: &Path, result: Result<GithubSnapshot, GhError>) {
        let key = normalized_path(&project_root.to_string_lossy());
        match result {
            Ok(snapshot) => {
                self.errors.remove(&key);
                self.snapshots.insert(key, snapshot);
            }
            Err(error) => {
                self.errors.insert(key, error.to_string());
            }
        }
    }

    pub fn get(&self, project_root: &Path) -> Option<&GithubSnapshot> {
        self.snapshots
            .get(&normalized_path(&project_root.to_string_lossy()))
    }

    pub fn error(&self, project_root: &Path) -> Option<&str> {
        self.errors
            .get(&normalized_path(&project_root.to_string_lossy()))
            .map(String::as_str)
    }
}

/// Lee GitHub de un proyecto y guarda el resultado. `None` si no tiene remoto de GitHub.
pub fn refresh(
    gh: &dyn GhClient,
    project_root: &Path,
    cache_path: &Path,
    now: u64,
) -> Option<Result<(), GhError>> {
    let repo = github_repo(project_root)?;
    let result = fetch(gh, project_root, &repo, now);
    let outcome = result.as_ref().map(|_| ()).map_err(Clone::clone);
    static CACHE_ACCESS: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _guard = CACHE_ACCESS
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let mut cache = GithubCache::load(cache_path);
    cache.record(project_root, result);
    if let Err(error) = cache.save(cache_path) {
        return Some(Err(GhError::Failed(error.to_string())));
    }
    Some(outcome)
}

enum PollMessage {
    Push(PathBuf),
    Stop,
}

/// Hilo que consulta GitHub cada [`POLL_SECS`] y al hacer push (Q56). Se para al soltarlo.
pub struct GithubPoller {
    tx: std::sync::mpsc::Sender<PollMessage>,
}

impl GithubPoller {
    /// `on_update` recibe la carpeta del proyecto tras cada lectura guardada.
    pub fn spawn(
        state_path: PathBuf,
        cache_path: PathBuf,
        interval: std::time::Duration,
        on_update: impl Fn(&Path) + Send + 'static,
    ) -> Self {
        Self::spawn_with_client(SystemGh, state_path, cache_path, interval, on_update)
    }

    fn spawn_with_client(
        gh: impl GhClient + Send + 'static,
        state_path: PathBuf,
        cache_path: PathBuf,
        interval: std::time::Duration,
        on_update: impl Fn(&Path) + Send + 'static,
    ) -> Self {
        use std::sync::mpsc::RecvTimeoutError;
        use std::time::Instant;

        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let mut next_poll = Instant::now();
            loop {
                let wait = next_poll.saturating_duration_since(Instant::now());
                // A busy push queue must not starve the periodic scan of other repos.
                let pushed = match rx.recv_timeout(wait) {
                    Ok(PollMessage::Push(project)) if !wait.is_zero() => Some(project),
                    Ok(PollMessage::Push(_)) | Err(RecvTimeoutError::Timeout) => None,
                    Ok(PollMessage::Stop) | Err(RecvTimeoutError::Disconnected) => break,
                };
                let projects: Vec<PathBuf> = match pushed {
                    Some(project) => vec![project],
                    None => {
                        next_poll = Instant::now() + interval;
                        LocalState::load(&state_path)
                            .watched_folders
                            .iter()
                            .map(PathBuf::from)
                            .filter(|p| p.is_dir())
                            .collect()
                    }
                };
                for project in projects {
                    if refresh(&gh, &project, &cache_path, unix_now()).is_some() {
                        on_update(&project);
                    }
                }
            }
        });
        Self { tx }
    }

    /// Hubo un push o un fetch en el proyecto: se consulta ya.
    pub fn pushed(&self, project: &Path) {
        let _ = self.tx.send(PollMessage::Push(project.to_path_buf()));
    }
}

impl Drop for GithubPoller {
    fn drop(&mut self) {
        let _ = self.tx.send(PollMessage::Stop);
    }
}

pub fn unix_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[test]
    fn polling_updates_other_projects_even_during_a_stream_of_pushes() {
        use std::sync::{Arc, Mutex, mpsc};
        use std::time::{Duration, Instant};

        struct RemotePrs(Arc<Mutex<String>>);
        impl GhClient for RemotePrs {
            fn run(&self, args: &[&str]) -> Result<String, GhError> {
                std::thread::sleep(Duration::from_millis(2));
                Ok(if args.starts_with(&["pr", "list"]) {
                    self.0.lock().unwrap().clone()
                } else {
                    "[]".into()
                })
            }
        }
        let root = std::env::temp_dir().join(format!(
            "wakeline-poll-{}-{}",
            std::process::id(),
            unix_now()
        ));
        let first = root.join("first");
        let second = root.join("second");
        for path in [&first, &second] {
            std::fs::create_dir_all(path.join(".git")).unwrap();
            std::fs::write(
                path.join(".git/config"),
                "[remote \"origin\"]\nurl = https://github.com/o/r.git\n",
            )
            .unwrap();
        }
        let state_path = root.join("state.json");
        LocalState {
            config_version: 1,
            watched_folders: vec![first.display().to_string(), second.display().to_string()],
            ..Default::default()
        }
        .save(&state_path)
        .unwrap();
        let remote = Arc::new(Mutex::new("[]".to_string()));
        let (tx, rx) = mpsc::channel();
        let cache_path = root.join("github.json");
        let poller = GithubPoller::spawn_with_client(
            RemotePrs(remote.clone()),
            state_path,
            cache_path.clone(),
            Duration::from_millis(25),
            move |path| {
                let _ = tx.send(path.to_path_buf());
            },
        );
        // Initial automatic pass, without Refresh or a push.
        assert_eq!(rx.recv_timeout(Duration::from_secs(2)).unwrap(), first);
        assert_eq!(rx.recv_timeout(Duration::from_secs(2)).unwrap(), second);
        *remote.lock().unwrap() = pr_json("2026-11-09T00:00:00Z", "[]", "[]");
        // Local churn in one project must not postpone remote PRs in the other.
        for _ in 0..100 {
            poller.pushed(&first);
        }
        let deadline = Instant::now() + Duration::from_millis(250);
        loop {
            let path = rx
                .recv_timeout(deadline.saturating_duration_since(Instant::now()))
                .expect("periodic polling was starved by push events");
            if path == second {
                break;
            }
        }
        let snapshot = GithubCache::load(&cache_path);
        assert_eq!(snapshot.get(&second).unwrap().pull_requests[0].number, 12);
        drop(poller);
    }

    /// `gh` simulado: responde por el primer argumento que coincide.
    struct FakeGh {
        answers: Vec<(&'static str, Result<String, GhError>)>,
        calls: RefCell<Vec<String>>,
    }

    impl GhClient for FakeGh {
        fn run(&self, args: &[&str]) -> Result<String, GhError> {
            assert!(is_read_only(args), "llamada no permitida: {args:?}");
            let joined = args.join(" ");
            self.calls.borrow_mut().push(joined.clone());
            self.answers
                .iter()
                .find(|(prefix, _)| joined.starts_with(prefix))
                .map(|(_, answer)| answer.clone())
                .unwrap_or_else(|| Err(GhError::Failed(format!("sin respuesta para {joined}"))))
        }
    }

    const NOW: u64 = 1_794_000_000; // 2026-11-07 aprox.

    fn fake(issues: &str, prs: &str, log: Result<String, GhError>) -> FakeGh {
        FakeGh {
            answers: vec![
                ("issue list", Ok(issues.into())),
                ("pr list", Ok(prs.into())),
                ("run view", log),
            ],
            calls: RefCell::new(Vec::new()),
        }
    }

    fn pr_json(created: &str, reviews: &str, checks: &str) -> String {
        format!(
            r#"[{{"number":12,"title":"Paso 5","url":"https://github.com/o/r/pull/12","headRefName":"feat","createdAt":"{created}","isDraft":false,"latestReviews":{reviews},"statusCheckRollup":{checks}}}]"#
        )
    }

    #[test]
    fn only_read_only_calls_are_allowed() {
        assert!(is_read_only(&["issue", "list", "--repo", "o/r"]));
        assert!(is_read_only(&["api", "user", "--jq", ".login"]));
        assert!(is_read_only(&["run", "view", "1", "--log-failed"]));
        assert!(!is_read_only(&["issue", "create"]));
        assert!(!is_read_only(&["pr", "merge", "1"]));
        assert!(!is_read_only(&["api", "-X", "POST", "repos/o/r/issues"]));
        assert!(!is_read_only(&["api", "repos/o/r/issues", "-f", "title=x"]));
        assert!(!is_read_only(&["auth", "login"]));
    }

    #[test]
    fn parses_github_remotes_only() {
        assert_eq!(
            parse_remote("https://github.com/o/r.git").as_deref(),
            Some("o/r")
        );
        assert_eq!(
            parse_remote("git@github.com:o/r.git").as_deref(),
            Some("o/r")
        );
        assert_eq!(
            parse_remote("ssh://git@github.com/o/r").as_deref(),
            Some("o/r")
        );
        assert_eq!(parse_remote("https://gitlab.com/o/r.git"), None);
    }

    #[test]
    fn discovers_origin_in_a_linked_worktree() {
        let root = std::env::temp_dir().join(format!("wakeline-worktree-{}", std::process::id()));
        let git = root.join("main.git");
        let tree = root.join("worktree");
        std::fs::create_dir_all(git.join("worktrees/feature")).unwrap();
        std::fs::create_dir_all(&tree).unwrap();
        std::fs::write(tree.join(".git"), "gitdir: ../main.git/worktrees/feature\n").unwrap();
        std::fs::write(git.join("worktrees/feature/commondir"), "../..\n").unwrap();
        std::fs::write(
            git.join("config"),
            "[remote \"origin\"]\nurl = https://github.com/team/project.git\n",
        )
        .unwrap();
        assert_eq!(github_repo(&tree).as_deref(), Some("team/project"));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn pr_details_preserve_line_numbers_and_redact_secrets() {
        let gh = FakeGh {
            answers: vec![
                ("api repos/o/r/pulls/12/files", Ok(r#"[{"filename":"src/a.ts","additions":1,"deletions":1,"patch":"@@ -4,1 +4,1 @@\n-old\n+const token=ghp_12345678901234567890"},{"filename":".env.production","additions":1,"deletions":0}]"#.into())),
                ("api repos/o/r/pulls/12", Ok(r#"{"body":"Fix parser","html_url":"https://github.com/o/r/pull/12"}"#.into())),
            ],
            calls: RefCell::new(Vec::new()),
        };
        let detail = fetch_pr_details(&gh, "o/r", 12).unwrap();
        assert_eq!(detail.body, "Fix parser");
        assert_eq!(detail.files.len(), 1);
        let patch = detail.files[0].patch.as_deref().unwrap();
        assert!(patch.starts_with("@@ -4,1 +4,1 @@"));
        assert!(!patch.contains("12345678901234567890"));
    }

    #[test]
    #[ignore = "requires gh login and WAKELINE_TEST_REPO / WAKELINE_TEST_PR"]
    fn reads_real_pr_details_with_system_gh() {
        let repo = std::env::var("WAKELINE_TEST_REPO").unwrap();
        let number = std::env::var("WAKELINE_TEST_PR").unwrap().parse().unwrap();
        let detail = fetch_pr_details(&SystemGh, &repo, number).unwrap();
        assert!(!detail.files.is_empty());
        assert!(detail.files.iter().any(|file| file.patch.is_some()));
        assert!(
            detail
                .files
                .iter()
                .all(|file| !crate::exclusions::is_excluded(Path::new(&file.filename)))
        );
    }

    #[test]
    fn issues_become_cards_by_label() {
        let issues = r#"[
          {"number":1,"title":"Se cae","url":"https://github.com/o/r/issues/1","labels":[{"name":"bug"}]},
          {"number":2,"title":"Modo oscuro","url":"https://github.com/o/r/issues/2","labels":[{"name":"Enhancement"}]},
          {"number":3,"title":"Docs","url":"https://github.com/o/r/issues/3","labels":[]}
        ]"#;
        let gh = fake(issues, "[]", Ok(String::new()));
        let snap = fetch(&gh, Path::new("C:/no-existe"), "o/r", NOW).unwrap();
        let kinds: Vec<_> = snap.cards.iter().map(|c| c.kind).collect();
        assert_eq!(kinds, vec![CardKind::Error, CardKind::Idea, CardKind::Task]);
        assert_eq!(snap.cards[0].title, "#1 Se cae");
        assert!(snap.complete);
    }

    #[test]
    fn changes_requested_and_stale_prs_become_tasks() {
        let prs = pr_json(
            "2026-10-01T00:00:00Z",
            r#"[{"author":{"login":"ana"},"state":"CHANGES_REQUESTED"},{"author":{"login":"bo"},"state":"APPROVED"}]"#,
            "[]",
        );
        let gh = fake("[]", &prs, Ok(String::new()));
        let snap = fetch(&gh, Path::new("C:/no-existe"), "o/r", NOW).unwrap();
        let titles: Vec<_> = snap.cards.iter().map(|c| c.title.as_str()).collect();
        assert_eq!(
            titles,
            vec![
                "Cambios pedidos por @ana en PR #12: Paso 5",
                "PR #12 abierto más de 7 días: Paso 5"
            ]
        );
        assert!(snap.cards.iter().all(|c| c.kind == CardKind::Task));
        assert_eq!(snap.pull_requests[0].review, ReviewState::ChangesRequested);
        assert!(snap.pull_requests[0].age_days > 7);
    }

    #[test]
    fn red_ci_log_gives_errors_with_the_local_path() {
        let dir = std::env::temp_dir().join(format!("wakeline-gh-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("apps/desktop/src")).unwrap();
        std::fs::write(dir.join("apps/desktop/src/a.ts"), "").unwrap();
        std::fs::write(
            dir.join("wakeline.toml"),
            "[[command]]\nname = \"tsc\"\nrun = [\"npx\", \"tsc\"]\ncwd = \"apps/desktop\"\n",
        )
        .unwrap();
        let checks = r#"[{"__typename":"CheckRun","name":"Windows","workflowName":"CI","status":"COMPLETED","conclusion":"FAILURE","detailsUrl":"https://github.com/o/r/actions/runs/42/job/7"}]"#;
        let log = "Windows\tFrontend\t2026-11-09T06:04:40.0861510Z \u{1b}[31msrc/a.ts(3,7): error TS2304: Cannot find name 'x'.\u{1b}[39m\n";
        let gh = fake(
            "[]",
            &pr_json("2026-11-06T00:00:00Z", "[]", checks),
            Ok(log.into()),
        );
        let snap = fetch(&gh, &dir, "o/r", NOW).unwrap();

        assert_eq!(snap.cards.len(), 1);
        let card = &snap.cards[0];
        assert_eq!(card.kind, CardKind::Error);
        assert_eq!(card.label, "ci");
        assert_eq!(card.location(), "apps/desktop/src/a.ts:3");
        assert_eq!(card.branch.as_deref(), Some("feat"));
        assert_eq!(card.title, "TS2304: Cannot find name 'x'.");
        assert_eq!(snap.pull_requests[0].ci, CiState::Failing);
        assert!(
            gh.calls
                .borrow()
                .iter()
                .any(|c| c.starts_with("run view 42"))
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_failed_run_log_is_downloaded_once_per_poller_thread() {
        let checks = r#"[{"name":"Windows","workflowName":"CI","conclusion":"FAILURE","detailsUrl":"https://github.com/o/cached/actions/runs/77/job/7"}]"#;
        let gh = fake(
            "[]",
            &pr_json("2026-11-06T00:00:00Z", "[]", checks),
            Ok("boom\n".into()),
        );
        fetch(&gh, Path::new("C:/no-existe"), "o/cached", NOW).unwrap();
        let snap = fetch(&gh, Path::new("C:/no-existe"), "o/cached", NOW).unwrap();
        let runs = gh
            .calls
            .borrow()
            .iter()
            .filter(|c| c.starts_with("run view 77"))
            .count();
        assert_eq!(runs, 1);
        assert!(snap.complete);
    }

    #[test]
    fn unreadable_ci_log_gives_one_red_ci_card_and_is_not_complete() {
        let checks = r#"[{"name":"Windows","workflowName":"CI","conclusion":"FAILURE","detailsUrl":"https://github.com/o/r/actions/runs/42/job/7"}]"#;
        let gh = fake(
            "[]",
            &pr_json("2026-11-06T00:00:00Z", "[]", checks),
            Err(GhError::Failed("sin red".into())),
        );
        let snap = fetch(&gh, Path::new("C:/no-existe"), "o/r", NOW).unwrap();
        assert_eq!(snap.cards[0].title, "CI rojo: CI/Windows en feat");
        assert!(!snap.complete);
    }

    #[test]
    fn hitting_the_list_limit_is_not_complete() {
        let issue = r#"{"number":1,"title":"x","url":"u","labels":[]}"#;
        let many = format!("[{}]", vec![issue; LIST_LIMIT].join(","));
        let gh = fake(&many, "[]", Ok(String::new()));
        let snap = fetch(&gh, Path::new("C:/no-existe"), "o/r", NOW).unwrap();
        assert!(!snap.complete);
    }

    #[test]
    fn gh_status_without_install_or_session() {
        let missing = FakeGh {
            answers: vec![("api user", Err(GhError::NotInstalled))],
            calls: RefCell::new(Vec::new()),
        };
        assert_eq!(status(&missing), GhStatus::NotInstalled);
        let logged_out = FakeGh {
            answers: vec![("api user", Err(GhError::Failed("auth".into())))],
            calls: RefCell::new(Vec::new()),
        };
        assert_eq!(status(&logged_out), GhStatus::NotLoggedIn);
        let ok = FakeGh {
            answers: vec![("api user", Ok("hopsiedev\n".into()))],
            calls: RefCell::new(Vec::new()),
        };
        assert_eq!(
            status(&ok),
            GhStatus::Connected {
                login: "hopsiedev".into()
            }
        );
    }

    #[test]
    fn failed_fetch_keeps_the_previous_snapshot() {
        let root = Path::new("C:/p");
        let mut cache = GithubCache::default();
        let gh = fake("[]", "[]", Ok(String::new()));
        cache.record(root, fetch(&gh, root, "o/r", NOW));
        cache.record(root, Err(GhError::Failed("sin red".into())));
        assert!(cache.get(root).is_some());
        assert_eq!(cache.error(root), Some("sin red"));
    }

    #[test]
    fn refresh_reports_a_cache_write_failure_instead_of_claiming_success() {
        let root =
            std::env::temp_dir().join(format!("wakeline-cache-failure-{}", std::process::id()));
        std::fs::create_dir_all(root.join(".git")).unwrap();
        std::fs::write(
            root.join(".git/config"),
            "[remote \"origin\"]\nurl = https://github.com/o/r.git\n",
        )
        .unwrap();
        let cache = root.join("cache.json");
        std::fs::create_dir_all(&cache).unwrap();
        let gh = fake("[]", "[]", Ok(String::new()));
        assert!(matches!(refresh(&gh, &root, &cache, NOW), Some(Err(_))));
    }

    #[test]
    fn reads_rfc3339_dates() {
        assert_eq!(unix_from_rfc3339("1970-01-02T00:00:00Z"), Some(86_400));
        assert_eq!(
            unix_from_rfc3339("2026-11-09T06:03:35Z"),
            Some(1_794_204_215)
        );
    }
}
