//! SQLite database: one file in the data directory, WAL mode, foreign keys on, migrations
//! applied when it opens.
//!
//! A single connection behind a mutex, used from blocking threads: plenty for a personal
//! server (thousands of tracks, a few users). Reads can move to a pool later if needed.

mod migrations;

use std::{
    path::{Path, PathBuf},
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

    /// A consistent copy of the whole database at `dest` (safe while the server runs).
    pub async fn backup_to(&self, dest: &Path) -> Result<()> {
        let dest = dest.to_owned();
        if dest.exists() {
            std::fs::remove_file(&dest)?;
        }
        self.call(move |c| {
            c.execute("VACUUM INTO ?1", [dest.to_string_lossy()])
                .context("database backup")?;
            Ok(())
        })
        .await
    }

    /// Today's backup in `dir` (`musonic-YYYY-MM-DD.db`), keeping `days` of them.
    pub async fn daily_backup(&self, dir: &Path, days: u64) -> Result<PathBuf> {
        std::fs::create_dir_all(dir)?;
        let day = crate::subsonic::iso_date(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)?
                .as_secs() as i64,
        );
        let dest = dir.join(format!("musonic-{day}.db"));
        let tmp = dir.join(format!(".musonic-{day}.db.part"));
        self.backup_to(&tmp).await?;
        std::fs::rename(&tmp, &dest)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&dest, std::fs::Permissions::from_mode(0o600));
        }
        // Older ones: names sort by date.
        let mut all: Vec<PathBuf> = std::fs::read_dir(dir)?
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(|n| n.starts_with("musonic-") && n.ends_with(".db"))
            })
            .collect();
        all.sort();
        let keep = days.max(1) as usize;
        if all.len() > keep {
            for old in &all[..all.len() - keep] {
                let _ = std::fs::remove_file(old);
            }
        }
        Ok(dest)
    }
}
