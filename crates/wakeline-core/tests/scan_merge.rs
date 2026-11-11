use wakeline_core::{CardStatus, scan_state::merge_scan, store::LocalState};

#[test]
fn scan_progress_merges_without_overwriting_concurrent_user_decisions() {
    let mut snapshot = LocalState::default();
    snapshot.session_offsets.insert("session".into(), 10);
    snapshot.set_status("task".into(), CardStatus::New);
    let mut scanned = snapshot.clone();
    scanned.session_offsets.insert("session".into(), 20);
    scanned.set_status("task".into(), CardStatus::Done);
    scanned.auto_closed.insert("task".into());
    let mut current = snapshot.clone();
    current.set_status("task".into(), CardStatus::Dismissed);
    current.extra.insert("new_preference".into(), true.into());
    current
        .trusted_commands
        .insert("project".into(), "new-hash".into());
    let merged = merge_scan(&snapshot, &scanned, current);
    assert_eq!(merged.session_offsets["session"], 20);
    assert_eq!(merged.status_for("task"), CardStatus::Dismissed);
    assert!(!merged.auto_closed.contains("task"));
    assert_eq!(merged.extra["new_preference"], true);
    assert_eq!(merged.trusted_commands["project"], "new-hash");
}

#[test]
fn history_import_keeps_session_offsets_and_cards_together() {
    let mut snapshot = LocalState::default();
    snapshot.session_offsets.insert("session".into(), 10);
    let mut scanned = snapshot.clone();
    scanned.session_offsets.insert("session".into(), 20);
    let mut current = snapshot.clone();
    current.session_offsets.insert("session".into(), 40);
    current.session_file_cards.insert("session".into(), vec![]);
    let merged = merge_scan(&snapshot, &scanned, current);
    assert_eq!(merged.session_offsets["session"], 40);
    assert!(merged.session_file_cards.contains_key("session"));
}

#[test]
fn automatic_status_changes_apply_only_without_concurrent_edits() {
    let snapshot = LocalState::default();
    let mut scanned = snapshot.clone();
    scanned.set_status("resolved".into(), CardStatus::Done);
    scanned.auto_closed.insert("resolved".into());
    let merged = merge_scan(&snapshot, &scanned, snapshot.clone());
    assert_eq!(merged.status_for("resolved"), CardStatus::Done);
    assert!(merged.auto_closed.contains("resolved"));
}

#[test]
fn changed_scan_scope_discards_stale_scan_results() {
    let snapshot = LocalState::default();
    let mut scanned = snapshot.clone();
    scanned.session_offsets.insert("old".into(), 20);
    let mut current = snapshot.clone();
    current.watched_folders.push("new-folder".into());
    assert!(
        merge_scan(&snapshot, &scanned, current)
            .session_offsets
            .is_empty()
    );
}
