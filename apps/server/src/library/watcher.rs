//! Keeps the library up to date: a scan at start-up, then a quick scan after changes in the music
//! folder (grouped over a few seconds), on a schedule, or when asked. Scans never overlap.

use std::{
    path::Path,
    sync::{Arc, Mutex, mpsc},
    time::Duration,
};

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tokio::sync::Notify;

use super::scanner::{ScanStats, Scanner};

/// Changes are grouped over this delay before a scan starts.
const DEBOUNCE: Duration = Duration::from_secs(5);

#[derive(Debug, Default, Clone, Serialize)]
pub struct ScanStatus {
    pub scanning: bool,
    pub last: Option<ScanStats>,
}

/// Handle to the background scanning task.
#[derive(Clone)]
pub struct LibraryService {
    wake: Arc<Notify>,
    full: Arc<Mutex<bool>>,
    status: Arc<Mutex<ScanStatus>>,
}

impl LibraryService {
    /// Starts the task. `interval`: periodic scan (`None` = only start-up, changes and requests).
    pub fn start(scanner: Scanner, root: std::path::PathBuf, interval: Option<Duration>) -> Self {
        let service = Self {
            wake: Arc::new(Notify::new()),
            full: Arc::new(Mutex::new(false)),
            status: Arc::new(Mutex::new(ScanStatus::default())),
        };

        let watcher = match watch(&root, service.wake.clone(), DEBOUNCE) {
            Ok(w) => Some(w),
            Err(e) => {
                tracing::warn!(
                    "cannot watch {}: {e}; relying on scheduled scans",
                    root.display()
                );
                None
            }
        };

        let this = service.clone();
        tokio::spawn(async move {
            let _watcher = watcher; // Lives as long as the task.
            loop {
                let full =
                    std::mem::take(&mut *this.full.lock().unwrap_or_else(|e| e.into_inner()));
                this.set(|s| s.scanning = true);
                let result = scanner.scan(full).await;
                this.set(|s| {
                    s.scanning = false;
                    match result {
                        Ok(stats) => s.last = Some(stats),
                        Err(ref e) => tracing::error!("scan failed: {e:#}"),
                    }
                });
                match interval {
                    Some(every) => {
                        let _ = tokio::time::timeout(every, this.wake.notified()).await;
                    }
                    None => this.wake.notified().await,
                }
            }
        });
        service
    }

    fn set(&self, f: impl FnOnce(&mut ScanStatus)) {
        f(&mut self.status.lock().unwrap_or_else(|e| e.into_inner()));
    }

    /// Asks for a scan (full = read every file again).
    pub fn request(&self, full: bool) {
        if full {
            *self.full.lock().unwrap_or_else(|e| e.into_inner()) = true;
        }
        self.wake.notify_one();
    }

    pub fn status(&self) -> ScanStatus {
        self.status
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }
}

/// Whether an event changes the library. Opening or reading a file (a scan, a stream, a
/// cover) does not: counting it would make every scan start the next one.
fn is_change(kind: &EventKind) -> bool {
    !matches!(kind, EventKind::Access(_))
}

/// Watches `root`; `wake` is notified once changes have stopped for `quiet`.
fn watch(root: &Path, wake: Arc<Notify>, quiet: Duration) -> notify::Result<RecommendedWatcher> {
    let (tx, rx) = mpsc::channel::<()>();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if res.is_ok_and(|e| is_change(&e.kind)) {
            let _ = tx.send(());
        }
    })?;
    watcher.watch(root, RecursiveMode::Recursive)?;
    // Ends with the watcher (the sender goes away with it).
    std::thread::spawn(move || {
        while rx.recv().is_ok() {
            while rx.recv_timeout(quiet).is_ok() {}
            wake.notify_one();
        }
    });
    Ok(watcher)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn reading_files_does_not_wake_changes_do() {
        let root = crate::testing::temp_dir("watch");
        std::fs::write(root.join("a.txt"), "x").unwrap();
        let wake = Arc::new(Notify::new());
        let _w = watch(&root, wake.clone(), Duration::from_millis(100)).unwrap();
        let woken = |ms| tokio::time::timeout(Duration::from_millis(ms), wake.notified());

        let _ = std::fs::read(root.join("a.txt")).unwrap();
        let _ = std::fs::read_dir(&root).unwrap().count();
        assert!(woken(500).await.is_err(), "a read is not a change");

        std::fs::write(root.join("b.txt"), "y").unwrap();
        assert!(woken(2000).await.is_ok(), "a new file is");
        let _ = std::fs::remove_dir_all(&root);
    }
}
