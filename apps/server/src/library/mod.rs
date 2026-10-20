//! The music library on disk: reading tags, scanning, watching for changes, writing tags.

pub mod import;
pub mod navidrome;
pub mod read;
pub mod scanner;
pub mod tags;
pub mod watcher;

pub use scanner::{ScanStats, Scanner};
pub use watcher::{LibraryService, ScanStatus};
