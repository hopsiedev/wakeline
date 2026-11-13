use std::collections::HashMap;
use std::sync::{
    Arc, Mutex, OnceLock,
    atomic::{AtomicBool, Ordering},
};

fn requests() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    static REQUESTS: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();
    REQUESTS.get_or_init(Mutex::default)
}

pub(crate) struct ReviewRequest {
    id: String,
    pub cancel: Arc<AtomicBool>,
}
impl ReviewRequest {
    pub fn start(id: String) -> Result<Self, String> {
        if id.is_empty() || id.len() > 128 {
            return Err("INVALID_REQUEST_ID".into());
        }
        let mut active = requests().lock().unwrap_or_else(|e| e.into_inner());
        if active.contains_key(&id) {
            return Err("DUPLICATE_REQUEST_ID".into());
        }
        let cancel = Arc::new(AtomicBool::new(false));
        active.insert(id.clone(), cancel.clone());
        Ok(Self { id, cancel })
    }
}
impl Drop for ReviewRequest {
    fn drop(&mut self) {
        requests()
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&self.id);
    }
}
pub fn cancel_review_agent(request_id: String) {
    if let Some(cancel) = requests()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get(&request_id)
    {
        cancel.store(true, Ordering::Relaxed);
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn cancel_is_scoped_and_request_is_removed_on_drop() {
        use std::sync::atomic::Ordering;
        let a = super::ReviewRequest::start("cancel-a".into()).unwrap();
        let b = super::ReviewRequest::start("cancel-b".into()).unwrap();
        super::cancel_review_agent("cancel-a".into());
        assert!(a.cancel.load(Ordering::Relaxed));
        assert!(!b.cancel.load(Ordering::Relaxed));
        assert!(super::ReviewRequest::start("cancel-a".into()).is_err());
        drop(a);
        let a = super::ReviewRequest::start("cancel-a".into()).unwrap();
        assert!(!a.cancel.load(Ordering::Relaxed));
    }
}
