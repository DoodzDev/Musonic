//! Serving audio: library files (direct, later transcoded) and provider streams through a
//! shared disk-backed segment cache.

mod session;

pub use session::{AudioSession, SEGMENT_SIZE, SessionManager};
