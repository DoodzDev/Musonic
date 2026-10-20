//! The server's journal (RMP-005 § 9, tranche C3): what happened, in short coded lines, in its
//! own database (`events.db`, beside `musonic.db`) so it never weighs on the library.
//!
//! A line is a time, a code (`login.ok`, `import.done`, `account.role`…), who did it, what it
//! was about, the address and the application, and a short detail. The console writes the
//! sentence, in its language. Actions of administrators are marked (`admin`): they make the
//! administration journal.
//!
//! The file has a maximum size (50 MB by default, set in the console): past it, the oldest
//! lines are removed. Nothing is grouped or summarised.

use std::{
    collections::HashMap,
    path::Path,
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
    },
    time::{Duration, Instant},
};

use anyhow::{Result, anyhow};
use rusqlite::{Connection, OptionalExtension, params_from_iter, types::Value};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::db::Db;

pub const DEFAULT_MAX_BYTES: u64 = 50 * 1000 * 1000;
/// Never under it: the journal must keep at least a few days.
pub const MIN_MAX_BYTES: u64 = 1000 * 1000;
const MAX_KEY: &str = "journal_max_bytes";
/// A device signing in again within it is not written again.
const SEEN_AGAIN: Duration = Duration::from_secs(6 * 3600);
const REFUSED_AGAIN: Duration = Duration::from_secs(10 * 60);

const SCHEMA: &str = "
    CREATE TABLE IF NOT EXISTS entry (
        id     INTEGER PRIMARY KEY,
        at     INTEGER NOT NULL,          -- Unix seconds
        code   TEXT NOT NULL,             -- `login.ok`, `import.done`…
        admin  INTEGER NOT NULL DEFAULT 0, -- done by an administrator (administration journal)
        user   TEXT,                      -- who did it
        target TEXT,                      -- what it was about (an account, a song…)
        ip     TEXT,
        device TEXT,                      -- the application
        detail TEXT
    ) STRICT;
    CREATE INDEX IF NOT EXISTS entry_admin ON entry(admin, id);
    CREATE INDEX IF NOT EXISTS entry_user ON entry(user, id);
";

/// One line to write.
#[derive(Debug, Default, Clone)]
pub struct Entry {
    pub code: &'static str,
    pub admin: bool,
    pub user: Option<String>,
    pub target: Option<String>,
    pub ip: Option<String>,
    pub device: Option<String>,
    pub detail: Option<String>,
}

impl Entry {
    pub fn new(code: &'static str) -> Self {
        Self {
            code,
            ..Default::default()
        }
    }

    /// Done by this administrator, from the console.
    pub fn by_admin(mut self, name: &str) -> Self {
        self.admin = true;
        self.user = Some(name.to_owned());
        self
    }

    pub fn user(mut self, name: impl Into<String>) -> Self {
        self.user = Some(name.into());
        self
    }

    pub fn target(mut self, what: impl Into<String>) -> Self {
        self.target = Some(what.into());
        self
    }

    pub fn ip(mut self, ip: impl Into<String>) -> Self {
        let ip = ip.into();
        self.ip = (!ip.is_empty()).then_some(ip);
        self
    }

    pub fn device(mut self, device: Option<&str>) -> Self {
        self.device = device.filter(|d| !d.is_empty()).map(str::to_owned);
        self
    }

    pub fn detail(mut self, detail: impl ToString) -> Self {
        self.detail = Some(detail.to_string());
        self
    }
}

/// A line as the console reads it.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct JournalEntry {
    #[ts(type = "number")]
    pub id: i64,
    #[ts(type = "number")]
    pub at: i64,
    pub code: String,
    pub admin: bool,
    pub user: Option<String>,
    pub target: Option<String>,
    pub ip: Option<String>,
    pub device: Option<String>,
    pub detail: Option<String>,
}

/// Which lines to read, newest first.
#[derive(Debug, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export)]
pub struct JournalQuery {
    /// Only the administration journal.
    pub admin: bool,
    /// Older than this line (the next page).
    #[ts(type = "number | null")]
    pub before: Option<i64>,
    /// Newer than this line (what came since).
    #[ts(type = "number | null")]
    pub after: Option<i64>,
    /// Codes starting with it (`login`, `import`…), or that code (`login.fail`); several
    /// separated by commas.
    pub kind: Option<String>,
    /// Done by this account, or about it.
    pub user: Option<String>,
    /// Anywhere in the line.
    pub q: Option<String>,
    #[ts(type = "number | null")]
    pub from: Option<i64>,
    #[ts(type = "number | null")]
    pub to: Option<i64>,
    pub limit: Option<u32>,
}

#[derive(Debug, Default, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct JournalSize {
    #[ts(type = "number")]
    pub bytes: u64,
    #[ts(type = "number")]
    pub max_bytes: u64,
    #[ts(type = "number")]
    pub lines: u64,
    /// The oldest line kept (Unix seconds).
    #[ts(type = "number | null")]
    pub oldest: Option<i64>,
}

/// A sign-in: code, account, application, address.
type SeenKey = (&'static str, String, String, String);

struct Inner {
    conn: Mutex<Connection>,
    max_bytes: AtomicU64,
    /// Last time each (code, account, application, address) of a sign-in was written.
    seen: Mutex<HashMap<SeenKey, Instant>>,
}

#[derive(Clone)]
pub struct Journal(Arc<Inner>);

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or_default()
}

impl Journal {
    /// Opens (or creates) the journal file.
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        // Before the first table: lets the file shrink after the oldest lines go.
        conn.execute_batch("PRAGMA auto_vacuum = INCREMENTAL;")?;
        Self::setup(conn)
    }

    /// In memory, for tests.
    pub fn memory() -> Self {
        Self::setup(Connection::open_in_memory().expect("in-memory journal"))
            .expect("journal schema")
    }

    fn setup(conn: Connection) -> Result<Self> {
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA busy_timeout = 5000;",
        )?;
        conn.execute_batch(SCHEMA)?;
        Ok(Self(Arc::new(Inner {
            conn: Mutex::new(conn),
            max_bytes: AtomicU64::new(DEFAULT_MAX_BYTES),
            seen: Mutex::new(HashMap::new()),
        })))
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Connection>> {
        self.0.conn.lock().map_err(|_| anyhow!("journal poisoned"))
    }

    /// Writes a line (a fraction of a millisecond). A failure is only traced: the journal
    /// never stops what it describes.
    pub fn log(&self, e: Entry) {
        let result = self.lock().and_then(|c| {
            c.execute(
                "INSERT INTO entry(at, code, admin, user, target, ip, device, detail)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                rusqlite::params![
                    now(),
                    e.code,
                    e.admin,
                    e.user,
                    e.target,
                    e.ip,
                    e.device,
                    e.detail
                ],
            )?;
            Ok(())
        });
        if let Err(err) = result {
            tracing::warn!("journal: {err:#}");
        }
    }

    /// A device signing in: written once every few hours, not at every request (Subsonic
    /// applications send their credentials each time).
    pub fn signed_in(&self, user: &str, device: Option<&str>, ip: &str) {
        self.log_once(
            Entry::new("login.ok").user(user).ip(ip).device(device),
            SEEN_AGAIN,
        );
    }

    /// A refused sign-in: the same one (code, name, application, address) once every few
    /// minutes, else an application keeping a wrong password fills the journal.
    pub fn refused(&self, code: &'static str, user: &str, device: Option<&str>, ip: &str) {
        self.log_once(
            Entry::new(code).user(user).ip(ip).device(device),
            REFUSED_AGAIN,
        );
    }

    fn log_once(&self, e: Entry, again: Duration) {
        let key = (
            e.code,
            e.user.clone().unwrap_or_default(),
            e.device.clone().unwrap_or_default(),
            e.ip.clone().unwrap_or_default(),
        );
        {
            let Ok(mut seen) = self.0.seen.lock() else {
                return;
            };
            if seen.get(&key).is_some_and(|at| at.elapsed() < again) {
                return;
            }
            if seen.len() > 10_000 {
                seen.retain(|_, at| at.elapsed() < SEEN_AGAIN);
            }
            seen.insert(key, Instant::now());
        }
        self.log(e);
    }

    /// Lines, newest first.
    pub async fn read(&self, q: JournalQuery) -> Result<Vec<JournalEntry>> {
        let this = self.clone();
        tokio::task::spawn_blocking(move || {
            let mut sql = String::from(
                "SELECT id, at, code, admin, user, target, ip, device, detail FROM entry WHERE 1",
            );
            let mut args: Vec<Value> = Vec::new();
            if q.admin {
                sql += " AND admin = 1";
            }
            if let Some(v) = q.before {
                sql += " AND id < ?";
                args.push(v.into());
            }
            if let Some(v) = q.after {
                sql += " AND id > ?";
                args.push(v.into());
            }
            // `login` (every login.*), `login.fail` (that code), or several: `account,invite`.
            let kinds: Vec<&str> = q
                .kind
                .as_deref()
                .unwrap_or_default()
                .split(',')
                .map(str::trim)
                .filter(|k| !k.is_empty())
                .collect();
            if !kinds.is_empty() {
                let one = "code = ? OR code LIKE ? ESCAPE '\\'";
                sql += &format!(" AND ({})", vec![one; kinds.len()].join(" OR "));
                for k in kinds {
                    args.push(k.to_owned().into());
                    args.push(format!("{}.%", escape(k)).into());
                }
            }
            if let Some(v) = q.user.filter(|u| !u.is_empty()) {
                sql += " AND (user = ? COLLATE NOCASE OR target = ? COLLATE NOCASE)";
                args.push(v.clone().into());
                args.push(v.into());
            }
            if let Some(v) = q.q.filter(|s| !s.trim().is_empty()) {
                let like = "LIKE ? ESCAPE '\\'";
                sql += &format!(
                    " AND (user {like} OR target {like} OR ip {like} OR device {like} OR detail {like} OR code {like})"
                );
                let pattern: Value = format!("%{}%", escape(v.trim())).into();
                args.extend(std::iter::repeat_n(pattern, 6));
            }
            if let Some(v) = q.from {
                sql += " AND at >= ?";
                args.push(v.into());
            }
            if let Some(v) = q.to {
                sql += " AND at < ?";
                args.push(v.into());
            }
            sql += if q.after.is_some() {
                " ORDER BY id ASC LIMIT ?"
            } else {
                " ORDER BY id DESC LIMIT ?"
            };
            args.push(i64::from(q.limit.unwrap_or(100).clamp(1, 500)).into());
            let c = this.lock()?;
            let mut out = c
                .prepare(&sql)?
                .query_map(params_from_iter(args), |r| {
                    Ok(JournalEntry {
                        id: r.get(0)?,
                        at: r.get(1)?,
                        code: r.get(2)?,
                        admin: r.get(3)?,
                        user: r.get(4)?,
                        target: r.get(5)?,
                        ip: r.get(6)?,
                        device: r.get(7)?,
                        detail: r.get(8)?,
                    })
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            if q.after.is_some() {
                out.reverse();
            }
            Ok(out)
        })
        .await?
    }

    pub async fn size(&self) -> Result<JournalSize> {
        let this = self.clone();
        tokio::task::spawn_blocking(move || {
            let c = this.lock()?;
            let (lines, oldest) = c.query_row("SELECT count(*), min(at) FROM entry", [], |r| {
                Ok((r.get::<_, i64>(0)?, r.get(1)?))
            })?;
            Ok(JournalSize {
                bytes: used_bytes(&c)?,
                max_bytes: this.0.max_bytes.load(Ordering::Relaxed),
                lines: lines.max(0) as u64,
                oldest,
            })
        })
        .await?
    }

    pub fn max_bytes(&self) -> u64 {
        self.0.max_bytes.load(Ordering::Relaxed)
    }

    /// Reads the maximum size kept in the server's settings.
    pub async fn load_settings(&self, db: &Db) -> Result<()> {
        let max: Option<String> = db
            .call(|c| {
                Ok(c.query_row(
                    "SELECT value FROM property WHERE key = ?1",
                    [MAX_KEY],
                    |r| r.get(0),
                )
                .optional()?)
            })
            .await?;
        if let Some(v) = max.and_then(|v| v.parse::<u64>().ok()) {
            self.0
                .max_bytes
                .store(v.max(MIN_MAX_BYTES), Ordering::Relaxed);
        }
        Ok(())
    }

    /// Sets the maximum size (kept in the server's settings) and applies it now.
    pub async fn set_max_bytes(&self, db: &Db, bytes: u64) -> Result<u64> {
        let bytes = bytes.max(MIN_MAX_BYTES);
        let v = bytes.to_string();
        db.call(move |c| {
            c.execute(
                "INSERT INTO property(key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                [MAX_KEY, &v],
            )?;
            Ok(())
        })
        .await?;
        self.0.max_bytes.store(bytes, Ordering::Relaxed);
        self.trim().await?;
        Ok(bytes)
    }

    /// Removes the oldest lines while the file is over its maximum size. Returns how many.
    pub async fn trim(&self) -> Result<u64> {
        let this = self.clone();
        tokio::task::spawn_blocking(move || {
            let max = this.max_bytes();
            let c = this.lock()?;
            let mut removed = 0;
            for _ in 0..50 {
                let used = used_bytes(&c)?;
                if used <= max {
                    break;
                }
                let lines: i64 = c.query_row("SELECT count(*) FROM entry", [], |r| r.get(0))?;
                if lines == 0 {
                    break;
                }
                // The share of lines over the limit, and a little more to not come back at once.
                let share = (1.0 - max as f64 / used as f64 + 0.02).clamp(0.01, 1.0);
                let n = ((lines as f64 * share).ceil() as i64).max(1);
                removed += c.execute(
                    "DELETE FROM entry WHERE id IN (SELECT id FROM entry ORDER BY id LIMIT ?1)",
                    [n],
                )? as u64;
                c.execute_batch("PRAGMA incremental_vacuum;")?;
            }
            if removed > 0 {
                c.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
            }
            Ok(removed)
        })
        .await?
    }

    /// Keeps the file under its maximum size, every few minutes.
    pub fn maintain(&self) {
        let this = self.clone();
        tokio::spawn(async move {
            let mut every = tokio::time::interval(Duration::from_secs(300));
            loop {
                every.tick().await;
                match this.trim().await {
                    Ok(0) => {}
                    Ok(n) => tracing::info!("journal: {n} oldest lines removed (maximum size)"),
                    Err(e) => tracing::warn!("journal: {e:#}"),
                }
            }
        });
    }
}

/// Pages in use (free pages, left by removed lines, do not count).
fn used_bytes(c: &Connection) -> Result<u64> {
    let pages: i64 = c.pragma_query_value(None, "page_count", |r| r.get(0))?;
    let free: i64 = c.pragma_query_value(None, "freelist_count", |r| r.get(0))?;
    let size: i64 = c.pragma_query_value(None, "page_size", |r| r.get(0))?;
    Ok(((pages - free).max(0) * size) as u64)
}

fn escape(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn reads_newest_first_with_filters() {
        let j = Journal::memory();
        j.log(
            Entry::new("login.ok")
                .user("Doodz")
                .ip("1.2.3.4")
                .device(Some("Musonic")),
        );
        j.log(Entry::new("login.fail").user("hugo").ip("5.6.7.8"));
        j.log(
            Entry::new("account.role")
                .by_admin("Doodz")
                .target("Hugo")
                .detail("admin"),
        );
        j.log(
            Entry::new("import.done")
                .user("Hugo")
                .target("Song — Artist"),
        );

        let all = j.read(JournalQuery::default()).await.unwrap();
        assert_eq!(all.len(), 4);
        assert_eq!(all[0].code, "import.done");
        let admin = j
            .read(JournalQuery {
                admin: true,
                ..Default::default()
            })
            .await
            .unwrap();
        assert_eq!(admin.len(), 1);
        assert_eq!(admin[0].target.as_deref(), Some("Hugo"));
        let logins = j
            .read(JournalQuery {
                kind: Some("login".into()),
                ..Default::default()
            })
            .await
            .unwrap();
        assert_eq!(logins.len(), 2);
        let some = j
            .read(JournalQuery {
                kind: Some("login.fail, import".into()),
                ..Default::default()
            })
            .await
            .unwrap();
        assert_eq!(
            some.iter().map(|e| e.code.as_str()).collect::<Vec<_>>(),
            ["import.done", "login.fail"]
        );
        let hugo = j
            .read(JournalQuery {
                user: Some("HUGO".into()),
                ..Default::default()
            })
            .await
            .unwrap();
        assert_eq!(hugo.len(), 3, "done by Hugo or about him, any case");
        let found = j
            .read(JournalQuery {
                q: Some("5.6.7".into()),
                ..Default::default()
            })
            .await
            .unwrap();
        assert_eq!(found.len(), 1);
        let none = j
            .read(JournalQuery {
                q: Some("%".into()),
                ..Default::default()
            })
            .await
            .unwrap();
        assert!(none.is_empty(), "% is searched as a character");
        let page = j
            .read(JournalQuery {
                before: Some(all[1].id),
                limit: Some(1),
                ..Default::default()
            })
            .await
            .unwrap();
        assert_eq!(page[0].id, all[2].id);
        let since = j
            .read(JournalQuery {
                after: Some(all[2].id),
                ..Default::default()
            })
            .await
            .unwrap();
        assert_eq!(
            since.iter().map(|e| e.id).collect::<Vec<_>>(),
            [all[0].id, all[1].id]
        );
    }

    #[tokio::test]
    async fn a_device_signing_in_again_is_written_once() {
        let j = Journal::memory();
        for _ in 0..5 {
            j.signed_in("Doodz", Some("Musonic"), "1.2.3.4");
        }
        j.signed_in("Doodz", Some("Musonic Web"), "1.2.3.4");
        for _ in 0..5 {
            j.refused("login.fail", "Doodz", Some("Musonic"), "1.2.3.4");
        }
        assert_eq!(j.size().await.unwrap().lines, 3);
    }

    #[tokio::test]
    async fn the_oldest_lines_go_past_the_maximum_size() {
        let dir = crate::testing::temp_dir("journal-trim");
        let j = Journal::open(&dir.join("events.db")).unwrap();
        for i in 0..20_000 {
            j.log(
                Entry::new("login.fail")
                    .user(format!("someone {i}"))
                    .ip("10.0.0.1"),
            );
        }
        let before = j.size().await.unwrap();
        assert!(before.bytes > MIN_MAX_BYTES, "{before:?}");
        j.0.max_bytes.store(MIN_MAX_BYTES, Ordering::Relaxed);
        assert!(j.trim().await.unwrap() > 0);
        let after = j.size().await.unwrap();
        assert!(after.bytes <= MIN_MAX_BYTES, "{after:?}");
        let newest = j
            .read(JournalQuery {
                limit: Some(1),
                ..Default::default()
            })
            .await
            .unwrap();
        assert_eq!(
            newest[0].user.as_deref(),
            Some("someone 19999"),
            "the newest are kept"
        );
        let file = std::fs::metadata(dir.join("events.db")).unwrap().len();
        assert!(file < before.bytes, "the file shrinks too");
    }
}
