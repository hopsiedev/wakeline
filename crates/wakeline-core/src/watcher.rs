//! Vigilante de carpetas compartido por la app y `wakeline watch` (Q39).
//!
//! Agrupa los cambios (debounce): espera a que pasen `debounce` sin cambios y entrega
//! el lote. Si los cambios no paran (una sesión de Claude Code escribiendo sin pausa),
//! entrega igual cada `max_wait` para que la vista no se quede congelada.

use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::time::{Duration, Instant};

use notify::{RecommendedWatcher, RecursiveMode, Watcher};

use crate::code::is_ignored_dir;
use crate::exclusions::is_excluded;

enum Signal {
    Changed(PathBuf),
    Stop,
}

/// Detiene un [`DirWatcher`] desde otro hilo (Ctrl+C, cambio de carpetas en la app).
#[derive(Clone)]
pub struct Stopper(Sender<Signal>);

impl Stopper {
    pub fn stop(&self) {
        let _ = self.0.send(Signal::Stop);
    }
}

pub struct DirWatcher {
    watcher: RecommendedWatcher,
    rx: Receiver<Signal>,
    debounce: Duration,
    max_wait: Duration,
}

impl DirWatcher {
    pub fn new(debounce: Duration, max_wait: Duration) -> notify::Result<(Self, Stopper)> {
        let (tx, rx) = mpsc::channel();
        let events = tx.clone();
        let watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
            if let Ok(event) = res {
                for path in event.paths {
                    if !is_ignored_path(&path) {
                        let _ = events.send(Signal::Changed(path));
                    }
                }
            }
        })?;
        Ok((
            Self {
                watcher,
                rx,
                debounce,
                max_wait: max_wait.max(debounce),
            },
            Stopper(tx),
        ))
    }

    /// Vigila `dir` y todo lo que tiene dentro.
    pub fn watch(&mut self, dir: &Path) -> notify::Result<()> {
        self.watcher.watch(dir, RecursiveMode::Recursive)
    }

    /// Espera el siguiente lote de rutas cambiadas. `None` cuando se pidió parar.
    pub fn next_batch(&self) -> Option<Vec<PathBuf>> {
        let first = match self.rx.recv().ok()? {
            Signal::Changed(path) => path,
            Signal::Stop => return None,
        };
        let started = Instant::now();
        let mut batch = vec![first];
        loop {
            let left = self.max_wait.saturating_sub(started.elapsed());
            if left.is_zero() {
                break;
            }
            match self.rx.recv_timeout(self.debounce.min(left)) {
                Ok(Signal::Changed(path)) => {
                    if !batch.contains(&path) {
                        batch.push(path);
                    }
                }
                Ok(Signal::Stop) | Err(RecvTimeoutError::Disconnected) => return None,
                Err(RecvTimeoutError::Timeout) => break,
            }
        }
        Some(batch)
    }
}

/// Rutas cuyos cambios no interesan: secretos, dependencias y carpetas de build.
pub fn is_ignored_path(path: &Path) -> bool {
    is_excluded(path)
        || path
            .components()
            .any(|c| is_ignored_dir(&c.as_os_str().to_string_lossy()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ignores_build_dirs_and_secrets() {
        assert!(is_ignored_path(Path::new(r"C:\p\node_modules\a\b.js")));
        assert!(is_ignored_path(Path::new(r"C:\p\.git\index")));
        assert!(is_ignored_path(Path::new(r"C:\p\.env.local")));
        assert!(!is_ignored_path(Path::new(r"C:\p\src\main.rs")));
    }

    #[test]
    fn delivers_a_batch_and_stops_on_request() {
        let dir = std::env::temp_dir().join(format!("wakeline-watcher-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let dir = std::fs::canonicalize(&dir).unwrap();

        let (mut watcher, stopper) =
            DirWatcher::new(Duration::from_millis(100), Duration::from_secs(2)).unwrap();
        watcher.watch(&dir).unwrap();
        let file = dir.join("main.rs");
        std::fs::write(&file, "// TODO: probar X\n").unwrap();

        let batch = watcher.next_batch().expect("lote de cambios");
        assert!(batch.iter().any(|p| p.ends_with("main.rs")));

        stopper.stop();
        assert!(watcher.next_batch().is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
