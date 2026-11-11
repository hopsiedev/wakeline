//! Optional round trip against a private COPY, never an installed user's store.
use wakeline_core::store::LocalState;

#[test]
#[ignore = "requires WAKELINE_UPGRADE_COPY pointing to a private copy of state.json"]
fn installed_state_copy_survives_two_restarts() {
    let fixture = std::env::var_os("WAKELINE_UPGRADE_COPY").expect("copy path required");
    let original = std::fs::read(&fixture).expect("read the private copy");
    let mut expected: serde_json::Value = serde_json::from_slice(&original).unwrap();
    if expected
        .get("config_version")
        .and_then(|v| v.as_u64())
        .unwrap_or(0)
        == 0
    {
        expected["config_version"] = 1.into();
    }
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("state.json");
    std::fs::write(&path, &original).unwrap();
    for _ in 0..2 {
        LocalState::load(&path).save(&path).unwrap();
        let actual: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        // Additive defaults are compatible; every previously stored value must survive.
        for (key, value) in expected.as_object().unwrap() {
            assert!(
                actual.get(key) == Some(value),
                "a previously stored field changed: {key}"
            );
        }
    }
    assert!(std::fs::read(path.with_extension("pre-refresh.json")).unwrap() == original);
}
