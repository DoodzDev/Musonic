//! SQLite database: one file in the data directory, WAL mode, foreign keys on, migrations
//! applied when it opens.
//!
//! A single connection behind a mutex, used from blocking threads: plenty for a personal
//! server (thousands of tracks, a few users). Reads can move to a pool later if needed.

mod migrations;

use std::{
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
    },
};

use anyhow::{Context, Result, anyhow};
use rusqlite::{Connection, functions::FunctionFlags};

pub use migrations::{MIGRATIONS, SCHEMA_VERSION};

#[derive(Clone)]
pub struct Db {
    conn: Arc<Mutex<Connection>>,
    /// Moves when what Subsonic answers show may have changed ([`Db::changes`]).
    changes: Arc<AtomicU64>,
    /// Moves when the library itself may have changed ([`Db::library_changes`]).
    library: Arc<AtomicU64>,
    /// Rows the update hook saw during the current call.
    seen: Arc<Seen>,
}

#[derive(Default)]
struct Seen {
    unshown: AtomicU64,
    library: AtomicU64,
    other: AtomicU64,
}

/// The library: what the scanner, imports and the online catalog write; not what accounts do
/// (likes, plays, playlists).
const LIBRARY: [&str; 14] = [
    "library",
    "folder",
    "artist",
    "album",
    "album_artist",
    "track",
    "track_artist",
    "track_file",
    "track_source",
    "album_source",
    "artist_source",
    "genre",
    "track_genre",
    "album_genre",
];

/// Tables no cached answer reads, written often (each sign-in, every minute, while playing,
/// while importing): their changes keep cached answers.
const UNSHOWN: [&str; 11] = [
    "api_key",
    "session",
    "metric_hour",
    "scrobble",
    "play_queue",
    "play_queue_item",
    "lyrics",
    "invitation",
    "password_reset",
    "import_job",
    "playlist_import_track",
];

impl Db {
    /// Opens (or creates) the database and brings its schema up to date.
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path).with_context(|| format!("opening {}", path.display()))?;
        copy_before_migrating(&conn, path)?;
        Self::setup(conn)
    }

    /// A fresh in-memory database, for tests.
    pub fn memory() -> Result<Self> {
        Self::setup(Connection::open_in_memory()?)
    }

    /// The connection itself, for synchronous tests. What they write is not counted: both
    /// counters move, so nothing kept before is used after.
    #[cfg(test)]
    pub fn lock(&self) -> std::sync::MutexGuard<'_, Connection> {
        let guard = self.conn.lock().unwrap();
        self.changes.fetch_add(1, Ordering::Release);
        self.library.fetch_add(1, Ordering::Release);
        guard
    }

    fn setup(mut conn: Connection) -> Result<Self> {
        // Temporary tables and sorts in memory: the container's file system is read-only
        // (`read_only: true`), SQLite would find nowhere to write them.
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;
             PRAGMA temp_store = MEMORY;",
        )?;
        // For migration 0008 (short ids, ADR-026): the same conversion as the server's.
        conn.create_scalar_function(
            "musonic_short_id",
            1,
            FunctionFlags::SQLITE_UTF8 | FunctionFlags::SQLITE_DETERMINISTIC,
            |ctx| {
                Ok(ctx
                    .get::<Option<String>>(0)?
                    .map(|id| crate::ids::shorten(&id).into_owned()))
            },
        )?;
        migrations::apply(&mut conn)?;
        let seen = Arc::new(Seen::default());
        let hook = seen.clone();
        conn.update_hook(Some(
            move |_: rusqlite::hooks::Action, _: &str, table: &str, _: i64| {
                let counter = if UNSHOWN.contains(&table) {
                    &hook.unshown
                } else if LIBRARY.contains(&table) {
                    &hook.library
                } else {
                    &hook.other
                };
                counter.fetch_add(1, Ordering::Relaxed);
            },
        ));
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
            changes: Arc::default(),
            library: Arc::default(),
            seen,
        })
    }

    /// Runs `f` with the connection on a blocking thread.
    pub async fn call<T, F>(&self, f: F) -> Result<T>
    where
        T: Send + 'static,
        F: FnOnce(&mut Connection) -> Result<T> + Send + 'static,
    {
        let (conn, seen) = (self.conn.clone(), self.seen.clone());
        let (changes, library) = (self.changes.clone(), self.library.clone());
        tokio::task::spawn_blocking(move || {
            let mut guard = conn
                .lock()
                .map_err(|_| anyhow!("database connection poisoned"))?;
            let before = guard.total_changes();
            for c in [&seen.unshown, &seen.library, &seen.other] {
                c.store(0, Ordering::Relaxed);
            }
            let result = f(&mut guard);
            let total = guard.total_changes() - before;
            let (unshown, lib, other) = (
                seen.unshown.load(Ordering::Relaxed),
                seen.library.load(Ordering::Relaxed),
                seen.other.load(Ordering::Relaxed),
            );
            // A change the hook did not see (some deletes, WITHOUT ROWID tables) counts as
            // anything: both counters move.
            let unseen = total > unshown + lib + other;
            if lib > 0 || unseen {
                library.fetch_add(1, Ordering::Release);
            }
            if lib > 0 || other > 0 || unseen {
                changes.fetch_add(1, Ordering::Release);
            }
            result
        })
        .await?
    }

    /// Moves whenever a row changes outside the [`UNSHOWN`] tables. Every write goes through
    /// this connection, so what was read at one value is still right while it stays the same.
    pub fn changes(&self) -> u64 {
        self.changes.load(Ordering::Acquire)
    }

    /// Like [`Db::changes`], for the [`LIBRARY`] tables only: stays the same while accounts
    /// like, play or edit playlists.
    pub fn library_changes(&self) -> u64 {
        self.library.load(Ordering::Acquire)
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
    /// Where today's backup goes in `dir`.
    pub fn todays_backup(dir: &Path) -> Result<PathBuf> {
        let day = crate::subsonic::iso_date(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)?
                .as_secs() as i64,
        );
        Ok(dir.join(format!("musonic-{day}.db")))
    }

    pub async fn daily_backup(&self, dir: &Path, days: u64) -> Result<PathBuf> {
        std::fs::create_dir_all(dir)?;
        let dest = Self::todays_backup(dir)?;
        let day = dest
            .file_stem()
            .and_then(|s| s.to_str())
            .and_then(|s| s.strip_prefix("musonic-"))
            .unwrap_or_default()
            .to_owned();
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

/// A copy of the database as it was (`<name>.before-schema-<n>`) before a migration changes
/// it, so an update that goes wrong can be undone by hand. Not for a new database.
fn copy_before_migrating(conn: &Connection, path: &Path) -> Result<()> {
    let current: u32 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
    if current == 0 || current >= SCHEMA_VERSION {
        return Ok(());
    }
    let mut dest = path.as_os_str().to_owned();
    dest.push(format!(".before-schema-{}", current + 1));
    let dest = PathBuf::from(dest);
    if !dest.exists() {
        conn.execute("VACUUM INTO ?1", [dest.to_string_lossy()])
            .context("copy of the database before migrating")?;
        tracing::info!("database copied to {} before migrating", dest.display());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn changes_move_only_for_shown_tables() {
        let db = Db::memory().unwrap();
        let start = db.changes();
        db.call(|c| Ok(c.query_row("SELECT count(*) FROM track", [], |r| r.get::<_, i64>(0))?))
            .await
            .unwrap();
        assert_eq!(db.changes(), start, "a read changes nothing");
        db.call(|c| {
            Ok(c.execute(
                "INSERT INTO metric_hour(hour, host_rx, host_tx, app_rx, app_tx, cpu_sum, samples)
                 VALUES (1, 0, 0, 0, 0, 0, 0)",
                [],
            )?)
        })
        .await
        .unwrap();
        assert_eq!(db.changes(), start, "measures are not shown in answers");
        db.call(|c| Ok(c.execute("INSERT INTO genre(id, name) VALUES (1, 'Jazz')", [])?))
            .await
            .unwrap();
        assert_eq!(db.changes(), start + 1);
        let library = db.library_changes();
        db.call(|c| Ok(c.execute("DELETE FROM genre", [])?))
            .await
            .unwrap();
        assert_eq!(db.changes(), start + 2, "a delete of the whole table too");
        assert_eq!(db.library_changes(), library + 1);
        db.call(|c| Ok(c.execute("INSERT INTO property(key, value) VALUES ('k', 'v')", [])?))
            .await
            .unwrap();
        assert_eq!(db.changes(), start + 3);
        assert_eq!(db.library_changes(), library + 1, "not the library");
    }
}
