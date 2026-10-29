//! Playlist imports in the background, one at a time and in the order asked: the songs pasted
//! as links are read first, each song is then looked for ([`super::matching`]), and the
//! playlist is made (or, when completing an import, its songs replaced) at the end. What is
//! done is saved song by song: after a restart, the import goes on where it stopped.

use std::{
    sync::Arc,
    time::{Duration, Instant},
};

use anyhow::Result;
use rusqlite::{OptionalExtension, params};
use tokio::sync::Notify;

use super::{SourceTrack, matching};
use crate::{
    events::{Event, PlaylistAction},
    journal::Entry,
    library::import,
    server::AppState,
};

/// Song links read from their service at once.
const LINKS_AT_ONCE: usize = 50;
/// Tries for one song when the online catalog does not answer.
const TRIES: u32 = 5;
/// Progress sent to the devices at most this often.
const PROGRESS_EVERY: Duration = Duration::from_secs(1);

/// Wakes the import task; cheap to clone.
#[derive(Clone, Default)]
pub struct PlaylistImports {
    wake: Arc<Notify>,
}

impl PlaylistImports {
    pub fn wake(&self) {
        self.wake.notify_one();
    }

    /// Starts the task that runs the imports.
    pub fn start(state: AppState) {
        tokio::spawn(async move {
            // Imports stopped by a restart go on.
            if let Err(e) = state
                .db
                .call(|c| {
                    Ok(c.execute(
                        "UPDATE playlist_import SET state = 'pending' WHERE state = 'running'",
                        [],
                    )?)
                })
                .await
            {
                tracing::warn!("playlist imports: {e:#}");
            }
            let wake = state.playlist_imports.wake.clone();
            loop {
                match next(&state).await {
                    Ok(Some(id)) => {
                        if let Err(e) = run(&state, &id).await {
                            tracing::warn!("playlist import {id}: {e:#}");
                            let _ = fail(&state, &id, &format!("{e:#}")).await;
                        }
                    }
                    Ok(None) => {
                        tokio::select! {
                            _ = wake.notified() => {}
                            _ = tokio::time::sleep(Duration::from_secs(300)) => {}
                        }
                    }
                    Err(e) => {
                        tracing::warn!("playlist imports: {e:#}");
                        tokio::time::sleep(Duration::from_secs(30)).await;
                    }
                }
            }
        });
    }
}

async fn next(state: &AppState) -> Result<Option<String>> {
    state
        .db
        .call(|c| {
            Ok(c.query_row(
                "SELECT id FROM playlist_import WHERE state = 'pending' ORDER BY updated_at, created_at LIMIT 1",
                [],
                |r| r.get(0),
            )
            .optional()?)
        })
        .await
}

async fn fail(state: &AppState, id: &str, error: &str) -> Result<()> {
    let (iid, error) = (id.to_owned(), error.to_owned());
    let user: Option<String> = state
        .db
        .call(move |c| {
            c.execute(
                "UPDATE playlist_import SET state = 'failed', error = ?2, updated_at = unixepoch() WHERE id = ?1",
                params![iid, error],
            )?;
            Ok(c.query_row("SELECT user_id FROM playlist_import WHERE id = ?1", [&iid], |r| r.get(0))
                .optional()?)
        })
        .await?;
    if let Some(user) = user {
        state.events.emit(
            &user,
            None,
            Event::PlaylistImport {
                id: id.to_owned(),
                state: "failed".into(),
                done: 0,
                total: 0,
                playlist: None,
            },
        );
    }
    Ok(())
}

struct Job {
    user: String,
    username: String,
    source: String,
    name: String,
    playlist: Option<String>,
}

/// A pending song: its position, and what the source said of it (empty title: a pasted link
/// not read yet).
struct Pending {
    position: i64,
    song: SourceTrack,
}

async fn load(state: &AppState, id: &str) -> Result<Option<(Job, Vec<Pending>, u32)>> {
    let id = id.to_owned();
    state
        .db
        .call(move |c| {
            let Some(job) = c
                .query_row(
                    "SELECT i.user_id, u.username, i.source, i.name, i.playlist_id
                       FROM playlist_import i JOIN user u ON u.id = i.user_id WHERE i.id = ?1",
                    [&id],
                    |r| {
                        Ok(Job {
                            user: r.get(0)?,
                            username: r.get(1)?,
                            source: r.get(2)?,
                            name: r.get(3)?,
                            playlist: r.get(4)?,
                        })
                    },
                )
                .optional()?
            else {
                return Ok(None);
            };
            let pending = c
                .prepare(
                    "SELECT position, title, artists, album, duration_ms, isrc, link, source_id
                       FROM playlist_import_track WHERE import_id = ?1 AND status = 'pending' ORDER BY position",
                )?
                .query_map([&id], |r| {
                    let artists: String = r.get(2)?;
                    Ok(Pending {
                        position: r.get(0)?,
                        song: SourceTrack {
                            title: r.get(1)?,
                            artists: artists.split(" • ").filter(|a| !a.is_empty()).map(str::to_owned).collect(),
                            album: r.get(3)?,
                            duration_ms: r.get(4)?,
                            isrc: r.get(5)?,
                            link: r.get(6)?,
                            id: r.get(7)?,
                        },
                    })
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            let total: u32 = c.query_row(
                "SELECT count(*) FROM playlist_import_track WHERE import_id = ?1",
                [&id],
                |r| r.get(0),
            )?;
            c.execute(
                "UPDATE playlist_import SET state = 'running', error = NULL, updated_at = unixepoch() WHERE id = ?1",
                [&id],
            )?;
            Ok(Some((job, pending, total)))
        })
        .await
}

/// Saves what was found for one song (`song`: its details, when just read from a link).
async fn save(
    state: &AppState,
    id: &str,
    position: i64,
    song: Option<SourceTrack>,
    found: &matching::Found,
) -> Result<bool> {
    let (id, status, reason, track) = (
        id.to_owned(),
        found.status(),
        found.reason(),
        found.track().map(str::to_owned),
    );
    state
        .db
        .call(move |c| {
            if let Some(s) = song {
                c.execute(
                    "UPDATE playlist_import_track SET title = ?3, artists = ?4, album = ?5, duration_ms = ?6, isrc = ?7
                      WHERE import_id = ?1 AND position = ?2",
                    params![id, position, s.title, s.artists.join(" • "), s.album, s.duration_ms, s.isrc],
                )?;
            }
            let changed = c.execute(
                "UPDATE playlist_import_track SET status = ?3, reason = ?4, track_id = ?5
                  WHERE import_id = ?1 AND position = ?2",
                params![id, position, status, reason, track],
            )?;
            Ok(changed > 0)
        })
        .await
}

/// Fills in the songs pasted as links (title, artists, length) from their service.
async fn read_links(state: &AppState, id: &str, job: &Job, pending: &mut [Pending]) -> Result<()> {
    let Some(source) = state
        .playlist_sources
        .iter()
        .find(|s| s.id() == job.source)
        .cloned()
    else {
        return Ok(());
    };
    let unread: Vec<usize> = pending
        .iter()
        .enumerate()
        .filter(|(_, p)| p.song.title.is_empty() && p.song.link.is_some())
        .map(|(i, _)| i)
        .collect();
    for chunk in unread.chunks(LINKS_AT_ONCE) {
        let links: Vec<String> = chunk
            .iter()
            .filter_map(|i| pending[*i].song.link.clone())
            .collect();
        let read = source
            .tracks(&links)
            .await
            .map_err(|e| anyhow::anyhow!("{e}"))?;
        for (i, song) in chunk.iter().zip(read) {
            let p = &mut pending[*i];
            let link = p.song.link.clone();
            p.song = SourceTrack { link, ..song };
            if p.song.title.is_empty() {
                // Not a song any more (removed from the service…): nothing to look for.
                save(
                    state,
                    id,
                    p.position,
                    None,
                    &matching::Found::Missing("not_found"),
                )
                .await?;
            } else {
                let s = p.song.clone();
                state
                    .db
                    .call({
                        let (id, position) = (id.to_owned(), p.position);
                        move |c| {
                            c.execute(
                                "UPDATE playlist_import_track SET title = ?3, artists = ?4, album = ?5, duration_ms = ?6,
                                        isrc = ?7, source_id = coalesce(?8, source_id)
                                  WHERE import_id = ?1 AND position = ?2",
                                params![id, position, s.title, s.artists.join(" • "), s.album, s.duration_ms, s.isrc, s.id],
                            )?;
                            Ok(())
                        }
                    })
                    .await?;
            }
        }
    }
    Ok(())
}

async fn run(state: &AppState, id: &str) -> Result<()> {
    let Some((job, mut pending, total)) = load(state, id).await? else {
        return Ok(());
    };
    let progress = |done: u32| {
        state.events.emit(
            &job.user,
            None,
            Event::PlaylistImport {
                id: id.to_owned(),
                state: "running".into(),
                done,
                total,
                playlist: None,
            },
        );
    };
    let mut done = total - pending.len() as u32;
    progress(done);
    read_links(state, id, &job, &mut pending).await?;
    let can_online = {
        let user = job.user.clone();
        state
            .db
            .call(move |c| Ok(crate::users::admin::limits_of(c, &user)?.can_online))
            .await?
    };
    let mut last = Instant::now();
    for p in pending.iter().filter(|p| !p.song.title.is_empty()) {
        let mut tries = 0;
        let found = loop {
            match matching::find(state, &job.source, &p.song, can_online).await {
                Ok(f) => break f,
                Err(e) if tries + 1 < TRIES => {
                    tries += 1;
                    tracing::debug!("playlist import {id}: {e:#}, trying again");
                    // Deezer refuses for a while when asked too much: 5, 10, 20, 40 s.
                    tokio::time::sleep(Duration::from_secs(5 << (tries - 1))).await;
                }
                Err(e) => {
                    tracing::warn!("playlist import {id}: « {} »: {e:#}", p.song.title);
                    break matching::Found::Missing("unavailable");
                }
            }
        };
        if !save(state, id, p.position, None, &found).await? {
            // The import was removed meanwhile.
            return Ok(());
        }
        done += 1;
        if last.elapsed() >= PROGRESS_EVERY {
            progress(done);
            last = Instant::now();
        }
    }
    finish(state, id, &job, total).await
}

/// Makes the playlist from what was found, in the source's order.
async fn finish(state: &AppState, id: &str, job: &Job, total: u32) -> Result<()> {
    let queue = state.imports.is_some();
    let (iid, user, name, existing) = (
        id.to_owned(),
        job.user.clone(),
        job.name.clone(),
        job.playlist.clone(),
    );
    let made = state
        .db
        .call(move |c| {
            let tx = c.transaction()?;
            let tracks: Vec<String> = tx
                .prepare(
                    "SELECT track_id FROM playlist_import_track
                      WHERE import_id = ?1 AND track_id IS NOT NULL AND status IN ('library', 'online', 'uncertain')
                      ORDER BY position",
                )?
                .query_map([&iid], |r| r.get(0))?
                .collect::<rusqlite::Result<_>>()?;
            let owned = match &existing {
                Some(p) => tx
                    .query_row("SELECT 1 FROM playlist WHERE id = ?1 AND owner_id = ?2", [p, &user], |_| Ok(()))
                    .optional()?
                    .is_some(),
                None => false,
            };
            let (playlist, action) = if owned {
                let p = existing.clone().unwrap_or_default();
                tx.execute("DELETE FROM playlist_track WHERE playlist_id = ?1", [&p])?;
                tx.execute("UPDATE playlist SET updated_at = unixepoch() WHERE id = ?1", [&p])?;
                (p, PlaylistAction::Updated)
            } else {
                let p = crate::ids::new_playlist_id();
                tx.execute(
                    "INSERT INTO playlist(id, owner_id, name) VALUES (?1, ?2, ?3)",
                    params![p, user, name],
                )?;
                (p, PlaylistAction::Created)
            };
            {
                let mut ins = tx.prepare_cached(
                    "INSERT INTO playlist_track(playlist_id, position, track_id) VALUES (?1, ?2, ?3)",
                )?;
                for (pos, t) in tracks.iter().enumerate() {
                    ins.execute(params![playlist, pos as i64, t])?;
                    if queue {
                        import::queue(&tx, t, Some(&user))?;
                    }
                }
            }
            tx.execute(
                "UPDATE playlist_import SET state = 'done', playlist_id = ?2, updated_at = unixepoch() WHERE id = ?1",
                params![iid, playlist],
            )?;
            tx.commit()?;
            Ok((playlist, action, tracks.len()))
        })
        .await?;
    let (playlist, action, found) = made;
    if let Some(imports) = &state.imports {
        imports.wake();
    }
    state.events.emit(
        &job.user,
        None,
        Event::Playlist {
            id: playlist.clone(),
            action,
        },
    );
    state.events.emit(
        &job.user,
        None,
        Event::PlaylistImport {
            id: id.to_owned(),
            state: "done".into(),
            done: total,
            total,
            playlist: Some(playlist),
        },
    );
    state.journal.log(
        Entry::new("playlist.imported")
            .user(&job.username)
            .target(&job.name)
            .detail(format!("{found}/{total}")),
    );
    tracing::info!(
        "playlist import {id}: « {} », {found} of {total} songs",
        job.name
    );
    Ok(())
}
