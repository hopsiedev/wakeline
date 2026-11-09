//! Agrupación de orígenes y cierre automático de señales (Q47, Q52, Q54).
//!
//! - Cada origen conserva su [`Fingerprint`](crate::Fingerprint) de siempre. Encima, la
//!   clave de grupo (tipo + rama + ruta relativa + mensaje, sin el origen) junta en una
//!   tarjeta el mismo error visto por `tsc` local y por el CI de la misma rama.
//! - Una señal se cierra sola solo cuando su fuente volvió a revisar el mismo alcance
//!   completo y ya no la ve ([`reconcile`]). Si reaparece, vuelve a «nueva».
//! - Un grupo con algún origen que no se cierra solo (sesión, documento) no se
//!   autocierra nunca.

use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use std::path::Path;

use crate::card::{CardKind, CardStatus, SourceKind};
use crate::code::CodeCard;
use crate::commands::CommandResult;
use crate::fingerprint::{normalize_message, normalize_path};
use crate::github::GithubSnapshot;
use crate::store::LocalState;
use crate::watch::normalized_path;

/// Días que se recuerda una señal cerrada sola antes de olvidarla.
pub const CLOSED_MEMORY_DAYS: u64 = 14;

/// Clave que junta orígenes distintos del mismo problema.
pub fn group_key(
    kind: CardKind,
    branch: Option<&str>,
    path: Option<&str>,
    message: &str,
) -> String {
    format!(
        "{}\u{1f}{}\u{1f}{}\u{1f}{}",
        kind.tag(),
        branch.unwrap_or("").trim().to_lowercase(),
        path.map(normalize_path).unwrap_or_default(),
        normalize_message(message)
    )
}

/// Estado de una tarjeta con varios orígenes.
///
/// Manda lo que haya decidido el usuario en cualquiera de sus huellas. Si no decidió
/// nada, la tarjeta está hecha solo cuando todas sus huellas se cerraron solas y todos
/// sus orígenes son de los que se cierran solos.
pub fn group_status(state: &LocalState, members: &[(&str, SourceKind)]) -> CardStatus {
    let user_status = members
        .iter()
        .filter(|(fp, _)| !state.auto_closed.contains(*fp))
        .filter_map(|(fp, _)| state.statuses.get(*fp).copied())
        .max_by_key(|status| precedence(*status));
    if let Some(status) = user_status {
        return status;
    }
    let all_auto = members.iter().all(|(_, source)| source.auto_resolves());
    let all_closed = !members.is_empty()
        && members
            .iter()
            .all(|(fp, _)| state.auto_closed.contains(*fp));
    if all_auto && all_closed {
        CardStatus::Done
    } else {
        CardStatus::New
    }
}

/// Si dos huellas del grupo tienen decisiones distintas, gana la más definitiva.
fn precedence(status: CardStatus) -> u8 {
    match status {
        CardStatus::New => 0,
        CardStatus::Accepted => 1,
        CardStatus::Done => 2,
        CardStatus::Dismissed => 3,
    }
}

/// Escribe la decisión del usuario en todas las huellas del grupo.
pub fn set_group_status(state: &mut LocalState, fingerprints: &[String], status: CardStatus) {
    for fp in fingerprints {
        state.auto_closed.remove(fp);
        state.set_status(fp.clone(), status);
    }
}

/// Lo que se recuerda de una señal para poder mostrarla cerrada cuando desaparece.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SignalMemo {
    /// Alcance que la produjo, por ejemplo `code:<proyecto>` o `command:<proyecto>:tsc`.
    pub scope: String,
    pub kind: CardKind,
    pub source: SourceKind,
    pub label: String,
    pub title: String,
    pub project: String,
    pub location: Option<String>,
    pub branch: Option<String>,
    /// Segundos Unix de la última vez que se vio.
    pub last_seen: u64,
}

/// La fuente revisó entero `scope` y vio `present`. Cierra lo que ya no está y reabre
/// lo que se había cerrado solo y volvió (Q47). Solo se llama con alcances completos.
pub fn reconcile(
    state: &mut LocalState,
    scope: &str,
    present: Vec<(String, SignalMemo)>,
    now: u64,
) {
    let seen: HashSet<&str> = present.iter().map(|(fp, _)| fp.as_str()).collect();
    let vanished: Vec<String> = state
        .signals
        .iter()
        .filter(|(fp, memo)| memo.scope == scope && !seen.contains(fp.as_str()))
        .map(|(fp, _)| fp.clone())
        .collect();
    for fp in vanished {
        let open = matches!(
            state.status_for(&fp),
            CardStatus::New | CardStatus::Accepted
        );
        if open && !state.auto_closed.contains(&fp) {
            state.auto_closed.insert(fp.clone());
            state.set_status(fp, CardStatus::Done);
        }
    }

    for (fp, mut memo) in present {
        if state.auto_closed.remove(&fp) {
            state.set_status(fp.clone(), CardStatus::New);
        }
        memo.last_seen = now;
        state.signals.insert(fp, memo);
    }

    let horizon = now.saturating_sub(CLOSED_MEMORY_DAYS * 24 * 3600);
    let forgotten: Vec<String> = state
        .signals
        .iter()
        .filter(|(fp, memo)| state.auto_closed.contains(*fp) && memo.last_seen < horizon)
        .map(|(fp, _)| fp.clone())
        .collect();
    for fp in forgotten {
        state.signals.remove(&fp);
        state.auto_closed.remove(&fp);
        state.statuses.remove(&fp);
    }
}

/// Señales de `scope` que se cerraron solas y todavía se recuerdan.
pub fn closed_in_scope<'a>(
    state: &'a LocalState,
    scope: &'a str,
) -> impl Iterator<Item = (&'a String, &'a SignalMemo)> + 'a {
    state
        .signals
        .iter()
        .filter(move |(fp, memo)| memo.scope == scope && state.auto_closed.contains(*fp))
}

/// Señales de un proyecto (código y comandos) que se cerraron solas y se recuerdan.
pub fn closed_in_project<'a>(
    state: &'a LocalState,
    project_root: &Path,
) -> impl Iterator<Item = (&'a String, &'a SignalMemo)> + 'a {
    let code = code_scope(project_root);
    let github = github_scope(project_root);
    let commands = format!(
        "command:{}:",
        normalized_path(&project_root.to_string_lossy())
    );
    state.signals.iter().filter(move |(fp, memo)| {
        state.auto_closed.contains(*fp)
            && (memo.scope == code || memo.scope == github || memo.scope.starts_with(&commands))
    })
}

/// Alcance de GitHub de un proyecto.
pub fn github_scope(project_root: &Path) -> String {
    format!(
        "github:{}",
        normalized_path(&project_root.to_string_lossy())
    )
}

/// Reconcilia la última lectura de GitHub. Si no fue completa (topes, logs que no se
/// pudieron leer), solo se recuerdan las señales vistas y no se cierra nada (Q54).
pub fn reconcile_github(
    state: &mut LocalState,
    project_root: &Path,
    project: &str,
    snapshot: &GithubSnapshot,
    now: u64,
) {
    let scope = github_scope(project_root);
    let present: Vec<(String, SignalMemo)> = snapshot
        .cards
        .iter()
        .map(|card| {
            (
                card.fingerprint.as_str().to_string(),
                SignalMemo {
                    scope: scope.clone(),
                    kind: card.kind,
                    source: card.source,
                    label: card.label.clone(),
                    title: card.title.clone(),
                    project: project.to_string(),
                    location: Some(card.location()),
                    branch: card.branch.clone(),
                    last_seen: now,
                },
            )
        })
        .collect();
    if snapshot.complete {
        reconcile(state, &scope, present, now);
    } else {
        for (fp, memo) in present {
            state.signals.insert(fp, memo);
        }
    }
}

/// Agrupa por clave conservando el orden de la primera aparición de cada grupo.
pub fn group_indices(keys: &[String]) -> Vec<Vec<usize>> {
    let mut groups: Vec<Vec<usize>> = Vec::new();
    let mut by_key: std::collections::HashMap<&str, usize> = std::collections::HashMap::new();
    for (idx, key) in keys.iter().enumerate() {
        match by_key.get(key.as_str()) {
            Some(&group) => groups[group].push(idx),
            None => {
                by_key.insert(key, groups.len());
                groups.push(vec![idx]);
            }
        }
    }
    groups
}

/// Alcance de los comentarios de un proyecto.
pub fn code_scope(project_root: &Path) -> String {
    format!("code:{}", normalized_path(&project_root.to_string_lossy()))
}

/// Alcance de un comando de un proyecto.
pub fn command_scope(project_root: &Path, command: &str) -> String {
    format!(
        "command:{}:{command}",
        normalized_path(&project_root.to_string_lossy())
    )
}

/// Reconcilia los comentarios de un proyecto tras un recorrido. Si el recorrido no fue
/// completo, solo se recuerdan las señales vistas y no se cierra nada.
pub fn reconcile_code(
    state: &mut LocalState,
    project_root: &Path,
    project: &str,
    branch: Option<&str>,
    cards: &[CodeCard],
    complete: bool,
    now: u64,
) {
    let scope = code_scope(project_root);
    let present: Vec<(String, SignalMemo)> = cards
        .iter()
        .map(|card| {
            (
                card.fingerprint.as_str().to_string(),
                SignalMemo {
                    scope: scope.clone(),
                    kind: card.kind,
                    source: SourceKind::Comment,
                    label: "TODO".into(),
                    title: card.title.clone(),
                    project: project.to_string(),
                    location: Some(card.location()),
                    branch: branch.map(Into::into),
                    last_seen: now,
                },
            )
        })
        .collect();
    if complete {
        reconcile(state, &scope, present, now);
    } else {
        for (fp, memo) in present {
            state.signals.insert(fp, memo);
        }
    }
}

/// Reconcilia el último resultado de un comando. Un timeout o un fallo al lanzar
/// conservan las tarjetas anteriores en el resultado, así que no cierran nada.
pub fn reconcile_command(
    state: &mut LocalState,
    project_root: &Path,
    project: &str,
    branch: Option<&str>,
    result: &CommandResult,
    now: u64,
) {
    let scope = command_scope(project_root, &result.command);
    let present = result
        .cards
        .iter()
        .map(|card| {
            (
                card.fingerprint.as_str().to_string(),
                SignalMemo {
                    scope: scope.clone(),
                    kind: card.kind,
                    source: SourceKind::Command,
                    label: result.command.clone(),
                    title: card.title.clone(),
                    project: project.to_string(),
                    location: card.location(),
                    branch: branch.map(Into::into),
                    last_seen: now,
                },
            )
        })
        .collect();
    reconcile(state, &scope, present, now);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn memo(scope: &str, source: SourceKind) -> SignalMemo {
        SignalMemo {
            scope: scope.into(),
            kind: CardKind::Error,
            source,
            label: "tsc".into(),
            title: "TS2304: x".into(),
            project: "p".into(),
            location: Some("src/a.ts:3".into()),
            branch: Some("main".into()),
            last_seen: 0,
        }
    }

    #[test]
    fn same_error_from_two_origins_on_the_same_branch_shares_a_key() {
        let local = group_key(
            CardKind::Error,
            Some("feat/x"),
            Some("src/a.ts:3"),
            "TS2304: Cannot find name 'x'.",
        );
        let ci = group_key(
            CardKind::Error,
            Some("feat/x"),
            Some("src\\a.ts:41"),
            "TS2304: Cannot find name 'x'.",
        );
        assert_eq!(local, ci);
        let other_branch = group_key(
            CardKind::Error,
            Some("main"),
            Some("src/a.ts"),
            "TS2304: Cannot find name 'x'.",
        );
        assert_ne!(local, other_branch);
    }

    #[test]
    fn vanished_signal_closes_and_comes_back_as_new() {
        let mut state = LocalState::default();
        let scope = "command:p:tsc";
        reconcile(
            &mut state,
            scope,
            vec![("fp1".into(), memo(scope, SourceKind::Command))],
            10,
        );
        assert_eq!(state.status_for("fp1"), CardStatus::New);

        reconcile(&mut state, scope, Vec::new(), 20);
        assert_eq!(state.status_for("fp1"), CardStatus::Done);
        assert_eq!(closed_in_scope(&state, scope).count(), 1);

        reconcile(
            &mut state,
            scope,
            vec![("fp1".into(), memo(scope, SourceKind::Command))],
            30,
        );
        assert_eq!(state.status_for("fp1"), CardStatus::New);
        assert_eq!(closed_in_scope(&state, scope).count(), 0);
    }

    #[test]
    fn user_decisions_are_never_touched() {
        let mut state = LocalState::default();
        let scope = "code:p";
        reconcile(
            &mut state,
            scope,
            vec![("fp1".into(), memo(scope, SourceKind::Comment))],
            10,
        );
        state.set_status("fp1".into(), CardStatus::Dismissed);
        reconcile(&mut state, scope, Vec::new(), 20);
        assert_eq!(state.status_for("fp1"), CardStatus::Dismissed);
        reconcile(
            &mut state,
            scope,
            vec![("fp1".into(), memo(scope, SourceKind::Comment))],
            30,
        );
        assert_eq!(state.status_for("fp1"), CardStatus::Dismissed);
    }

    #[test]
    fn other_scopes_are_left_alone() {
        let mut state = LocalState::default();
        reconcile(
            &mut state,
            "command:p:tsc",
            vec![("fp1".into(), memo("command:p:tsc", SourceKind::Command))],
            10,
        );
        reconcile(&mut state, "command:p:eslint", Vec::new(), 20);
        assert_eq!(state.status_for("fp1"), CardStatus::New);
    }

    #[test]
    fn group_with_two_origins_closes_only_when_both_are_gone() {
        let mut state = LocalState::default();
        state.auto_closed.insert("tsc".into());
        state.set_status("tsc".into(), CardStatus::Done);
        let members = [
            ("tsc", SourceKind::Command),
            ("ci", SourceKind::PullRequest),
        ];
        assert_eq!(group_status(&state, &members), CardStatus::New);
        state.auto_closed.insert("ci".into());
        assert_eq!(group_status(&state, &members), CardStatus::Done);
    }

    #[test]
    fn group_with_a_session_origin_never_autocloses() {
        let mut state = LocalState::default();
        state.auto_closed.insert("tsc".into());
        state.set_status("tsc".into(), CardStatus::Done);
        let members = [
            ("tsc", SourceKind::Command),
            ("sesion", SourceKind::Session),
        ];
        assert_eq!(group_status(&state, &members), CardStatus::New);
    }

    #[test]
    fn user_status_on_any_member_wins_and_is_written_to_all() {
        let mut state = LocalState::default();
        state.set_status("b".into(), CardStatus::Accepted);
        let members = [("a", SourceKind::Command), ("b", SourceKind::Session)];
        assert_eq!(group_status(&state, &members), CardStatus::Accepted);

        set_group_status(&mut state, &["a".into(), "b".into()], CardStatus::Done);
        assert_eq!(state.status_for("a"), CardStatus::Done);
        assert_eq!(state.status_for("b"), CardStatus::Done);
        assert_eq!(group_status(&state, &members), CardStatus::Done);
    }

    #[test]
    fn closed_issue_closes_its_card_only_after_a_complete_read() {
        use crate::fingerprint::Fingerprint;
        use crate::github::GithubCard;

        let card = GithubCard {
            fingerprint: Fingerprint::new(CardKind::Error, SourceKind::Issue, Some("u"), "#1 x"),
            kind: CardKind::Error,
            source: SourceKind::Issue,
            label: "Issue".into(),
            title: "#1 x".into(),
            url: "u".into(),
            branch: None,
            path: None,
            line: None,
            occurrences: 1,
        };
        let fp = card.fingerprint.as_str().to_string();
        let snapshot = |cards: Vec<GithubCard>, complete: bool| GithubSnapshot {
            repo: "o/r".into(),
            fetched_at: 0,
            complete,
            cards,
            pull_requests: Vec::new(),
        };
        let root = Path::new("C:/p");
        let mut state = LocalState::default();
        reconcile_github(&mut state, root, "p", &snapshot(vec![card], true), 10);
        reconcile_github(&mut state, root, "p", &snapshot(Vec::new(), false), 20);
        assert_eq!(state.status_for(&fp), CardStatus::New);
        reconcile_github(&mut state, root, "p", &snapshot(Vec::new(), true), 30);
        assert_eq!(state.status_for(&fp), CardStatus::Done);
        assert_eq!(closed_in_project(&state, root).count(), 1);
    }

    #[test]
    fn removed_todo_closes_only_after_a_complete_scan() {
        use crate::code::CodeScanner;

        let dir = std::env::temp_dir().join(format!("wakeline-signals-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("a.rs"),
            "// TODO: probar X
",
        )
        .unwrap();
        let mut scanner = CodeScanner::new();
        let mut state = LocalState::default();

        let cards = scanner.scan_project(&dir);
        reconcile_code(&mut state, &dir, "p", None, &cards, true, 10);
        let fp = cards[0].fingerprint.as_str().to_string();
        assert_eq!(state.status_for(&fp), CardStatus::New);

        // Un recorrido incompleto no cierra nada.
        reconcile_code(&mut state, &dir, "p", None, &[], false, 20);
        assert_eq!(state.status_for(&fp), CardStatus::New);

        std::fs::write(
            dir.join("a.rs"),
            "fn a() {}
",
        )
        .unwrap();
        let cards = scanner.scan_project(&dir);
        assert!(scanner.last_scan_complete());
        reconcile_code(&mut state, &dir, "p", None, &cards, true, 30);
        assert_eq!(state.status_for(&fp), CardStatus::Done);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn two_origins_of_the_same_branch_make_one_group() {
        let tsc = group_key(
            CardKind::Error,
            Some("feat"),
            Some("src/a.ts:3"),
            "TS2304: x",
        );
        let ci = group_key(
            CardKind::Error,
            Some("feat"),
            Some("src/a.ts:3"),
            "TS2304: x",
        );
        let todo = group_key(CardKind::Task, Some("feat"), Some("src/a.ts:9"), "probar");
        let groups = group_indices(&[tsc, todo, ci]);
        assert_eq!(groups, vec![vec![0, 2], vec![1]]);
    }

    #[test]
    fn closed_signals_are_forgotten_after_two_weeks() {
        let mut state = LocalState::default();
        let scope = "code:p";
        reconcile(
            &mut state,
            scope,
            vec![("fp1".into(), memo(scope, SourceKind::Comment))],
            10,
        );
        reconcile(&mut state, scope, Vec::new(), 20);
        reconcile(
            &mut state,
            scope,
            Vec::new(),
            20 + CLOSED_MEMORY_DAYS * 24 * 3600,
        );
        assert!(state.signals.is_empty());
        assert!(state.auto_closed.is_empty());
    }
}
