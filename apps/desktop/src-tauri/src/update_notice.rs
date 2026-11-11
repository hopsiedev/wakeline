/// A notification is sent once per new version; a failed delivery may retry.
#[derive(Default)]
pub struct UpdateNotice {
    last: Option<String>,
}
impl UpdateNotice {
    pub fn pending(&self, state: &str, version: Option<&str>) -> bool {
        matches!(state, "available" | "manual")
            && version
                .is_some_and(|version| !version.is_empty() && self.last.as_deref() != Some(version))
    }
    pub fn delivered(&mut self, version: &str) {
        self.last = Some(version.to_owned());
    }
}
