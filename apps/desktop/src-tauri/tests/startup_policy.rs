#[allow(dead_code)]
#[path = "../src/startup.rs"]
mod startup;
#[test]
fn quotes_executable_and_starts_background() {
    assert_eq!(
        startup::launch_command(std::path::Path::new(
            "C:\\Program Files\\Wakeline\\Wakeline.exe"
        ))
        .unwrap(),
        "\"C:\\Program Files\\Wakeline\\Wakeline.exe\" --background"
    );
}
#[test]
fn only_explicit_background_flag_hides_window() {
    assert!(startup::background(["app", "--background"]));
    assert!(!startup::background(["app", "--background=false"]));
    assert!(!startup::background(["app"]));
}
