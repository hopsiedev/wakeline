#[path = "../src/update_notice.rs"]
mod update_notice;
#[test]
fn notify_only_for_new_available_versions_and_retry_failed_delivery() {
    let mut tracker = update_notice::UpdateNotice::default();
    assert!(!tracker.pending("up_to_date", None));
    assert!(tracker.pending("available", Some("0.1.7")));
    assert!(tracker.pending("available", Some("0.1.7")));
    tracker.delivered("0.1.7");
    assert!(!tracker.pending("manual", Some("0.1.7")));
    assert!(tracker.pending("manual", Some("0.1.8")));
    assert!(!tracker.pending("unpublished", Some("0.1.8")));
}
