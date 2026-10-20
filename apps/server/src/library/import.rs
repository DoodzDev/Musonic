//! Imports: online tracks turned into library files in the background.
//!
//! A track liked or added to a playlist while it has no file gets a job. The worker downloads
//! it whole from a provider whose files may be imported, writes its tags (the ones the scanner
//! reads back to attach the file to the same track: title, artists, album, album artist, disc,
//! number), puts it in `<library>/<import_dir>/Album Artist/Album/NN - Title.ext` and asks for a
//! scan. A failed job is tried again later (5 min, 30 min, 2 h, 12 h), then given up.

use std::{
    path::{Path, PathBuf},
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use anyhow::{Context, Result, bail};
use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;
use tokio::sync::Notify;

use super::{LibraryService, tags};
use crate::{
    db::Db,
    events::{Event, ImportState},
    model::{Quality, Track, TrackAlbum, TrackArtist},
    remote::{self, Remote},
};

/// Delays before the next attempts; after the last one the job is given up.
const RETRIES: [i64; 4] = [5 * 60, 30 * 60, 2 * 3600, 12 * 3600];
/// Imports running at the same time.
const PARALLEL: i64 = 2;
/// Check for due jobs at least this often (retries come due without a wake-up).
const POLL: Duration = Duration::from_secs(60);

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or_default()
}

/// Asks for `track` to be imported, unless it has a file present or is already being imported.
/// A job given up is tried again from scratch. Returns whether a job is now pending.
pub fn queue(c: &Connection, track: &str, user: Option<&str>) -> rusqlite::Result<bool> {
    let has_file: bool = c
        .prepare_cached(
            "SELECT EXISTS (SELECT 1 FROM track_file WHERE track_id = ?1 AND missing = 0)",
        )?
        .query_row([track], |r| r.get(0))?;
    if has_file {
        return Ok(false);
    }
    let changed = c
        .prepare_cached(
            "INSERT INTO import_job(track_id, requested_by) VALUES (?1, ?2)
             ON CONFLICT(track_id) DO UPDATE SET state = 'pending', attempts = 0, last_error = NULL,
                 next_try_at = unixepoch(), updated_at = unixepoch()
             WHERE import_job.state IN ('failed', 'done')",
        )?
        .execute(params![track, user])?;
    Ok(changed > 0)
}

#[derive(Debug, Default, Clone, Serialize)]
pub struct ImportCounts {
    pub pending: i64,
    pub running: i64,
    pub failed: i64,
    pub done: i64,
}

pub fn counts(c: &Connection) -> rusqlite::Result<ImportCounts> {
    let mut out = ImportCounts::default();
    let mut st = c.prepare_cached("SELECT state, count(*) FROM import_job GROUP BY state")?;
    let rows = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?;
    for row in rows {
        let (state, n) = row?;
        match state.as_str() {
            "pending" => out.pending = n,
            "running" => out.running = n,
            "failed" => out.failed = n,
            _ => out.done = n,
        }
    }
    Ok(out)
}

/// Handle to the background import task.
#[derive(Clone)]
pub struct ImportService {
    wake: Arc<Notify>,
}

impl ImportService {
    /// A handle without a worker: jobs are queued and run by hand (tests).
    #[cfg(test)]
    pub fn idle() -> Self {
        Self {
            wake: Arc::new(Notify::new()),
        }
    }

    /// New jobs are waiting.
    pub fn wake(&self) {
        self.wake.notify_one();
    }
}

pub struct Importer {
    pub db: Db,
    pub remote: Remote,
    /// Library root.
    pub root: PathBuf,
    /// Folder of the imports, relative to the root.
    pub dir: String,
    pub quality: Quality,
    pub library: Option<LibraryService>,
    pub http: reqwest::Client,
    /// Tells the account that asked when its import is done or given up.
    pub events: Option<crate::events::Events>,
}

impl Importer {
    pub fn start(self) -> ImportService {
        let wake = Arc::new(Notify::new());
        let service = ImportService { wake: wake.clone() };
        let this = Arc::new(self);
        tokio::spawn(async move {
            // Jobs cut short by a restart start again.
            let _ = this
                .db
                .call(|c| {
                    c.execute(
                        "UPDATE import_job SET state = 'pending' WHERE state = 'running'",
                        [],
                    )?;
                    Ok(())
                })
                .await;
            loop {
                match this.clone().run_due().await {
                    Ok(0) => {
                        let _ = tokio::time::timeout(POLL, wake.notified()).await;
                    }
                    Ok(_) => {}
                    Err(e) => {
                        tracing::error!("imports: {e:#}");
                        tokio::time::sleep(POLL).await;
                    }
                }
            }
        });
        service
    }

    /// Runs the jobs due now (a few at a time); returns how many ran.
    pub async fn run_due(self: Arc<Self>) -> Result<usize> {
        let due: Vec<(String, i64)> = self
            .db
            .call(|c| {
                let tx = c.transaction()?;
                let jobs: Vec<(String, i64)> = tx
                    .prepare(
                        "SELECT track_id, attempts FROM import_job
                          WHERE state = 'pending' AND next_try_at <= unixepoch()
                          ORDER BY next_try_at LIMIT ?1",
                    )?
                    .query_map([PARALLEL], |r| Ok((r.get(0)?, r.get(1)?)))?
                    .collect::<rusqlite::Result<_>>()?;
                for (track, _) in &jobs {
                    tx.execute(
                        "UPDATE import_job SET state = 'running', updated_at = unixepoch() WHERE track_id = ?1",
                        [track],
                    )?;
                }
                tx.commit()?;
                Ok(jobs)
            })
            .await?;
        let count = due.len();
        let runs = due.into_iter().map(|(track, attempts)| {
            let this = self.clone();
            async move {
                let result = this.import(&track).await;
                this.finish(&track, attempts, result).await
            }
        });
        for r in futures_util::future::join_all(runs).await {
            r?;
        }
        if count > 0
            && let Some(lib) = &self.library
        {
            lib.request(false);
        }
        Ok(count)
    }

    async fn finish(
        &self,
        track: &str,
        attempts: i64,
        result: Result<Option<(String, &'static str)>>,
    ) -> Result<()> {
        let state = match &result {
            Ok(_) => Some(ImportState::Done),
            Err(_) if RETRIES.get(attempts as usize).is_none() => Some(ImportState::Failed),
            Err(_) => None,
        };
        let path = result.as_ref().ok().cloned().flatten().map(|(p, _)| p);
        self.record(track, attempts, result).await?;
        if let (Some(state), Some(events)) = (state, &self.events) {
            let t = track.to_owned();
            let user: Option<String> = self
                .db
                .call(move |c| {
                    Ok(c.query_row(
                        "SELECT requested_by FROM import_job WHERE track_id = ?1",
                        [&t],
                        |r| r.get(0),
                    )
                    .optional()?
                    .flatten())
                })
                .await?;
            if let Some(user) = user {
                events.emit(
                    &user,
                    None,
                    Event::Import {
                        id: track.to_owned(),
                        state,
                        path,
                    },
                );
            }
        }
        Ok(())
    }

    async fn record(
        &self,
        track: &str,
        attempts: i64,
        result: Result<Option<(String, &'static str)>>,
    ) -> Result<()> {
        let track = track.to_owned();
        match result {
            Ok(done) => {
                let (path, provider) = done.map_or((None, None), |(p, by)| (Some(p), Some(by)));
                if let Some(p) = &path {
                    tracing::info!("imported {p}");
                }
                self.db
                    .call(move |c| {
                        c.execute(
                            "UPDATE import_job SET state = 'done', attempts = ?2, last_error = NULL,
                                 path = coalesce(?3, path), provider = coalesce(?4, provider),
                                 updated_at = unixepoch()
                              WHERE track_id = ?1",
                            params![track, attempts + 1, path, provider],
                        )?;
                        Ok(())
                    })
                    .await
            }
            Err(e) => {
                let attempts = attempts + 1;
                let retry = RETRIES.get(attempts as usize - 1).copied();
                tracing::warn!(
                    "import of {track} failed ({attempts} attempts): {e:#}{}",
                    if retry.is_some() {
                        "; will try again"
                    } else {
                        "; given up"
                    }
                );
                let error = format!("{e:#}");
                self.db
                    .call(move |c| {
                        c.execute(
                            "UPDATE import_job SET state = ?2, attempts = ?3, last_error = ?4,
                                 next_try_at = ?5, updated_at = unixepoch()
                              WHERE track_id = ?1",
                            params![
                                track,
                                if retry.is_some() { "pending" } else { "failed" },
                                attempts,
                                error,
                                now() + retry.unwrap_or(0)
                            ],
                        )?;
                        Ok(())
                    })
                    .await
            }
        }
    }

    /// Imports one track. `Ok(None)`: nothing to do (a file arrived meanwhile).
    async fn import(&self, id: &str) -> Result<Option<(String, &'static str)>> {
        let Some(meta) = metadata(&self.db, id).await? else {
            bail!("track gone");
        };
        if meta.has_file {
            return Ok(None);
        }
        let Some((session, provider)) = remote::open(&self.remote, id, self.quality, true).await?
        else {
            bail!("no provider has this track");
        };
        session.download_all().await.context("download")?;
        let rel = Path::new(&self.dir).join(tags::relative_path(&meta.track, session.format));
        let dest = self.root.join(&rel);
        if let Some(dir) = dest.parent() {
            tokio::fs::create_dir_all(dir).await?;
        }
        let part = dest.with_extension(format!("{}.part", session.format.extension()));
        session.copy_to(&part).await?;
        let cover = match &meta.cover_url {
            Some(url) => self.cover(url).await,
            None => None,
        };
        let (track, part2) = (meta.track.clone(), part.clone());
        tokio::task::spawn_blocking(move || tags::tag_file(&part2, &track, cover)).await??;
        tokio::fs::rename(&part, &dest).await?;
        Ok(Some((rel.to_string_lossy().into_owned(), provider)))
    }

    async fn cover(&self, url: &str) -> Option<Vec<u8>> {
        let res = self
            .http
            .get(url)
            .send()
            .await
            .ok()?
            .error_for_status()
            .ok()?;
        Some(res.bytes().await.ok()?.to_vec())
    }
}

struct Meta {
    track: Track,
    cover_url: Option<String>,
    has_file: bool,
}

/// The tags of the file to write, from the track as stored (see `online::store::Tags`).
async fn metadata(db: &Db, id: &str) -> Result<Option<Meta>> {
    let id = id.to_owned();
    db.call(move |c| {
        let Some((title, album, album_id, disc, number, date, isrc, cover, duration)) = c
            .query_row(
                "SELECT t.title, al.title, t.album_id, t.disc_number, t.track_number,
                        coalesce(t.release_date, al.release_date), t.isrc,
                        coalesce(al.cover_url, t.cover_url), t.duration_ms
                   FROM track t LEFT JOIN album al ON al.id = t.album_id WHERE t.id = ?1",
                [&id],
                |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, Option<String>>(1)?,
                        r.get::<_, Option<String>>(2)?,
                        r.get::<_, Option<i64>>(3)?,
                        r.get::<_, Option<i64>>(4)?,
                        r.get::<_, Option<String>>(5)?,
                        r.get::<_, Option<String>>(6)?,
                        r.get::<_, Option<String>>(7)?,
                        r.get::<_, i64>(8)?,
                    ))
                },
            )
            .optional()?
        else {
            return Ok(None);
        };
        let names = |sql: &str, key: &Option<String>| -> rusqlite::Result<Vec<(String, String)>> {
            c.prepare_cached(sql)?
                .query_map([key], |r| Ok((r.get(0)?, r.get(1)?)))?
                .collect()
        };
        let artists = names(
            "SELECT ar.id, ar.name FROM track_artist ta JOIN artist ar ON ar.id = ta.artist_id
              WHERE ta.track_id = ?1 AND ta.role = 'artist' ORDER BY ta.position",
            &Some(id.clone()),
        )?;
        let album_artists = names(
            "SELECT ar.id, ar.name FROM album_artist aa JOIN artist ar ON ar.id = aa.artist_id
              WHERE aa.album_id = ?1 ORDER BY aa.position",
            &album_id,
        )?;
        let has_file: bool = c.query_row(
            "SELECT EXISTS (SELECT 1 FROM track_file WHERE track_id = ?1 AND missing = 0)",
            [&id],
            |r| r.get(0),
        )?;
        Ok(Some(Meta {
            track: Track {
                id: id.clone(),
                title,
                isrc,
                duration: duration / 1000,
                cover_url: cover.clone(),
                disc_number: disc,
                track_number: number,
                is_explicit: false,
                popularity: None,
                album: album.map(|title| TrackAlbum {
                    id: album_id.clone().unwrap_or_default(),
                    title,
                    cover_url: cover.clone(),
                    artists: album_artists.into_iter().map(|(_, n)| n).collect(),
                }),
                artists: artists
                    .into_iter()
                    .map(|(id, name)| TrackArtist { id, name })
                    .collect(),
                release_date: date,
                sources: Default::default(),
                in_library: false,
            },
            cover_url: cover,
            has_file,
        }))
    })
    .await
}
