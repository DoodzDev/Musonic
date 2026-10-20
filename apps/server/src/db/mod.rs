//! SQLite database: one file in the data directory, WAL mode, foreign keys on, migrations
//! applied when it opens.
//!
//! A single connection behind a mutex, used from blocking threads: plenty for a personal
//! server (thousands of tracks, a few users). Reads can move to a pool later if needed.

mod migrations;

use std::{
    path::Path,
    sync::{Arc, Mutex},
};

use anyhow::{Context, Result, anyhow};
use rusqlite::Connection;

pub use migrations::{MIGRATIONS, SCHEMA_VERSION};

#[derive(Clone)]
pub struct Db {
    conn: Arc<Mutex<Connection>>,
}

impl Db {
    /// Opens (or creates) the database and brings its schema up to date.
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path).with_context(|| format!("opening {}", path.display()))?;
        Self::setup(conn)
    }

    /// A fresh in-memory database, for tests.
    pub fn memory() -> Result<Self> {
        Self::setup(Connection::open_in_memory()?)
    }

    /// The connection itself, for synchronous tests.
    #[cfg(test)]
    pub fn lock(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.lock().unwrap()
    }

    fn setup(mut conn: Connection) -> Result<Self> {
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;",
        )?;
        migrations::apply(&mut conn)?;
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    /// Runs `f` with the connection on a blocking thread.
    pub async fn call<T, F>(&self, f: F) -> Result<T>
    where
        T: Send + 'static,
        F: FnOnce(&mut Connection) -> Result<T> + Send + 'static,
    {
        let conn = self.conn.clone();
        tokio::task::spawn_blocking(move || {
            let mut guard = conn
                .lock()
                .map_err(|_| anyhow!("database connection poisoned"))?;
            f(&mut guard)
        })
        .await?
    }

    /// Schema version (number of migrations applied).
    pub async fn version(&self) -> Result<u32> {
        self.call(|c| Ok(c.pragma_query_value(None, "user_version", |r| r.get(0))?))
            .await
    }
}
