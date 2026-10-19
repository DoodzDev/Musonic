//! Keeps the library up to date: a scan at start-up, then a quick scan after changes in the music
//! folder (grouped over a few seconds), on a schedule, or when asked. Scans never overlap.

use std::{
    sync::{Arc, Mutex},
    time::Duration,
};

use notify::RecursiveMode;
use notify_debouncer_mini::new_debouncer;
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

        // File system events wake the task (the debouncer groups them).
        let wake = service.wake.clone();
        let watcher = new_debouncer(
            DEBOUNCE,
            move |res: notify_debouncer_mini::DebounceEventResult| {
                if res.is_ok_and(|events| !events.is_empty()) {
                    wake.notify_one();
                }
            },
        )
        .and_then(|mut d| {
            d.watcher()
                .watch(&root, RecursiveMode::Recursive)
                .map(|_| d)
        });
        let watcher = match watcher {
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
