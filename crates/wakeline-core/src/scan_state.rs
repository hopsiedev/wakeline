//! Reconcile a scan snapshot with changes saved while the scan was running.
use crate::store::LocalState;
use std::collections::{HashMap, HashSet};

pub fn merge_scan(
    snapshot: &LocalState,
    scanned: &LocalState,
    mut current: LocalState,
) -> LocalState {
    if snapshot.watched_folders != current.watched_folders
        || snapshot.full_session_history != current.full_session_history
    {
        return current;
    }
    let files: HashSet<_> = snapshot
        .session_offsets
        .keys()
        .chain(scanned.session_offsets.keys())
        .chain(snapshot.session_file_cards.keys())
        .chain(scanned.session_file_cards.keys())
        .collect();
    for key in files {
        if current.session_offsets.get(key) == snapshot.session_offsets.get(key)
            && current.session_file_cards.get(key) == snapshot.session_file_cards.get(key)
        {
            apply(&mut current.session_offsets, &scanned.session_offsets, key);
            apply(
                &mut current.session_file_cards,
                &scanned.session_file_cards,
                key,
            );
        }
    }
    let fingerprints: HashSet<_> = snapshot
        .statuses
        .keys()
        .chain(scanned.statuses.keys())
        .chain(snapshot.signals.keys())
        .chain(scanned.signals.keys())
        .chain(snapshot.auto_closed.iter())
        .chain(scanned.auto_closed.iter())
        .collect();
    for key in fingerprints {
        if current.statuses.get(key) == snapshot.statuses.get(key)
            && current.signals.get(key) == snapshot.signals.get(key)
            && current.auto_closed.contains(key) == snapshot.auto_closed.contains(key)
        {
            apply(&mut current.statuses, &scanned.statuses, key);
            apply(&mut current.signals, &scanned.signals, key);
            if scanned.auto_closed.contains(key) {
                current.auto_closed.insert(key.clone());
            } else {
                current.auto_closed.remove(key);
            }
        }
    }
    current
}

fn apply<T: Clone>(current: &mut HashMap<String, T>, scanned: &HashMap<String, T>, key: &str) {
    if let Some(value) = scanned.get(key) {
        current.insert(key.into(), value.clone());
    } else {
        current.remove(key);
    }
}
