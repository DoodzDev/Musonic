//! Playlists imported from Spotify or Deezer by any account (ADR-020).
//!
//! | Route | |
//! |---|---|
//! | `POST /v1/playlist-imports/preview` | `{url}` or `{text}` (pasted song links): what would be imported, nothing written |
//! | `POST /v1/playlist-imports` | `{url}` or `{text}`, `name`, `into` (an import to complete): starts an import |
//! | `GET /v1/playlist-imports` | The account's imports, newest first |
//! | `GET /v1/playlist-imports/{id}` · `DELETE` | One import with its songs · forget it (the playlist stays) |
//! | `POST /v1/playlist-imports/{id}/retry` | Looks for the songs not found again |

use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::json;
use ts_rs::TS;

use super::{ApiError, Auth, Reply};
use crate::{
    playlist_import::{MAX_TRACKS, PlaylistSource, SourceError, SourcePlaylist, host},
    server::AppState,
};

/// Imports waiting or running for one account at most.
const MAX_WAITING: u32 = 5;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/v1/playlist-imports/preview", post(preview))
        .route("/v1/playlist-imports", get(list).post(start))
        .route("/v1/playlist-imports/{id}", get(one).delete(remove))
        .route("/v1/playlist-imports/{id}/retry", post(retry))
}

#[derive(Deserialize, Default, TS)]
#[serde(default, rename_all = "camelCase")]
#[ts(export)]
pub struct PlaylistImportRequest {
    /// Address of a playlist.
    #[ts(optional)]
    pub url: Option<String>,
    /// Song links pasted from the service's app (Spotify: Ctrl+A, Ctrl+C in a playlist).
    #[ts(optional)]
    pub text: Option<String>,
    /// Name of the playlist made (the source's by default).
    #[ts(optional)]
    pub name: Option<String>,
    /// An import to complete with `text`: its playlist gets the whole list.
    #[ts(optional)]
    pub into: Option<String>,
}

/// What an address or a pasted list holds, before importing.
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PlaylistPreview {
    /// `deezer`, `spotify`.
    pub source: String,
    /// `None` for pasted links.
    pub name: Option<String>,
    pub owner: Option<String>,
    pub cover_url: Option<String>,
    /// Songs the playlist has, when known.
    pub total: Option<u32>,
    /// Songs that will be read.
    pub read: u32,
    /// Opens the playlist in the service's app (`spotify:playlist:…`).
    pub app_link: Option<String>,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PlaylistImport {
    pub id: String,
    pub source: String,
    pub name: String,
    pub url: Option<String>,
    pub cover_url: Option<String>,
    /// The playlist made, once done (`None` before, or when it was deleted).
    pub playlist_id: Option<String>,
    /// `pending`, `running`, `done`, `failed`.
    pub state: String,
    pub error: Option<String>,
    /// Songs read from the source.
    pub total: u32,
    /// Songs looked for so far.
    pub done: u32,
    pub library: u32,
    pub online: u32,
    pub uncertain: u32,
    pub missing: u32,
    /// Songs the source playlist has (more than `total`: only part of it was read).
    pub source_total: Option<u32>,
    pub app_link: Option<String>,
    #[ts(type = "number")]
    pub created_at: i64,
    #[ts(type = "number")]
    pub updated_at: i64,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PlaylistImportTrack {
    pub position: u32,
    pub title: String,
    pub artists: Vec<String>,
    pub album: Option<String>,
    #[ts(type = "number | null")]
    pub duration_ms: Option<i64>,
    pub link: Option<String>,
    /// `pending`, `library`, `online`, `uncertain`, `missing`.
    pub status: String,
    /// Why missing: `not_found`, `online_not_allowed`, `unavailable`.
    pub reason: Option<String>,
    pub track_id: Option<String>,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PlaylistImportDetail {
    pub import: PlaylistImport,
    pub tracks: Vec<PlaylistImportTrack>,
}

fn source_error(e: SourceError) -> ApiError {
    match e {
        SourceError::NotMine => ApiError::bad("not a playlist address"),
        SourceError::NotFound => ApiError(
            StatusCode::NOT_FOUND,
            "playlist not found or private".into(),
        ),
        SourceError::Unavailable(e) => {
            tracing::warn!("playlist source: {e:#}");
            ApiError(
                StatusCode::BAD_GATEWAY,
                "the service does not answer, try again later".into(),
            )
        }
    }
}

/// The source for an address; a known service that is not available here is told so.
fn source_for(state: &AppState, url: &str) -> Result<Arc<dyn PlaylistSource>, ApiError> {
    if let Some(s) = state.playlist_sources.iter().find(|s| s.knows(url)) {
        return Ok(s.clone());
    }
    let h = host(url).unwrap_or_default();
    if h.contains("spotify") || url.trim_start().starts_with("spotify:") {
        return Err(ApiError(
            StatusCode::NOT_IMPLEMENTED,
            "spotify is not available on this server".into(),
        ));
    }
    if h.contains("deezer") {
        return Err(ApiError(
            StatusCode::NOT_IMPLEMENTED,
            "the online catalog is off on this server".into(),
        ));
    }
    Err(ApiError::bad("not a playlist address"))
}

/// The source reading a pasted list of links, and those links.
fn links_in(
    state: &AppState,
    text: &str,
) -> Result<(Arc<dyn PlaylistSource>, Vec<String>), ApiError> {
    for s in state.playlist_sources.iter() {
        let links = s.links(text);
        if !links.is_empty() {
            return Ok((s.clone(), links));
        }
    }
    if text.contains("spotify") {
        return Err(ApiError(
            StatusCode::NOT_IMPLEMENTED,
            "spotify is not available on this server".into(),
        ));
    }
    Err(ApiError::bad("no song links"))
}

fn app_link(source: &str, id: Option<&str>) -> Option<String> {
    (source == "spotify")
        .then(|| Some(format!("spotify:playlist:{}", id?)))
        .flatten()
}

fn preview_of(p: &SourcePlaylist) -> PlaylistPreview {
    PlaylistPreview {
        source: p.source.clone(),
        name: Some(p.name.clone()),
        owner: p.owner.clone(),
        cover_url: p.cover_url.clone(),
        total: p.total,
        read: p.tracks.len() as u32,
        app_link: p
            .app_link
            .clone()
            .or_else(|| app_link(&p.source, p.id.as_deref())),
    }
}

async fn preview(
    State(state): State<AppState>,
    _auth: Auth,
    Json(body): Json<PlaylistImportRequest>,
) -> Reply {
    if let Some(text) = body.text.filter(|t| !t.trim().is_empty()) {
        let (source, links) = links_in(&state, &text)?;
        let n = links.len().min(MAX_TRACKS) as u32;
        return Ok(Json(json!(PlaylistPreview {
            source: source.id().to_owned(),
            name: None,
            owner: None,
            cover_url: None,
            total: Some(links.len() as u32),
            read: n,
            app_link: None,
        })));
    }
    let url = body
        .url
        .map(|u| u.trim().to_owned())
        .filter(|u| !u.is_empty())
        .ok_or_else(|| ApiError::bad("url or text"))?;
    let source = source_for(&state, &url)?;
    let p = source.playlist(&url).await.map_err(source_error)?;
    Ok(Json(json!(preview_of(&p))))
}

/// One row per song: (title, artists, album, length, isrc, link, id there).
type Row = (
    String,
    String,
    Option<String>,
    Option<i64>,
    Option<String>,
    Option<String>,
    Option<String>,
);
/// What to import: source, its playlist id, address, name, cover, songs it has, the rows.
type Wanted = (
    String,
    Option<String>,
    Option<String>,
    String,
    Option<String>,
    Option<u32>,
    Vec<Row>,
);
/// A song already looked for: link, title, artists, album, length, isrc, id there, status,
/// reason, track.
type Known = (
    String,
    String,
    String,
    Option<String>,
    Option<i64>,
    Option<String>,
    Option<String>,
    String,
    Option<String>,
    Option<String>,
);

async fn start(
    State(state): State<AppState>,
    auth: Auth,
    Json(body): Json<PlaylistImportRequest>,
) -> Reply {
    let user = auth.user.id.clone();
    let waiting: u32 = {
        let user = user.clone();
        state
            .db
            .call(move |c| {
                Ok(c.query_row(
                    "SELECT count(*) FROM playlist_import WHERE user_id = ?1 AND state IN ('pending', 'running')",
                    [&user],
                    |r| r.get(0),
                )?)
            })
            .await?
    };
    if waiting >= MAX_WAITING {
        return Err(ApiError(
            StatusCode::TOO_MANY_REQUESTS,
            "too many imports waiting".into(),
        ));
    }
    let name = body
        .name
        .map(|n| n.trim().to_owned())
        .filter(|n| !n.is_empty());

    // What to import: a playlist read now, or pasted links read in the background.
    let (source, source_id, url, title, cover, source_total, rows): Wanted =
        if let Some(text) = body.text.filter(|t| !t.trim().is_empty()) {
            let (source, mut links) = links_in(&state, &text)?;
            links.truncate(MAX_TRACKS);
            let rows = links
                .into_iter()
                .map(|l| {
                    (
                        String::new(),
                        String::new(),
                        None,
                        None,
                        None,
                        Some(l),
                        None,
                    )
                })
                .collect();
            (
                source.id().to_owned(),
                None,
                None,
                name.clone().unwrap_or_default(),
                None,
                None,
                rows,
            )
        } else {
            let url = body
                .url
                .map(|u| u.trim().to_owned())
                .filter(|u| !u.is_empty())
                .ok_or_else(|| ApiError::bad("url or text"))?;
            let source = source_for(&state, &url)?;
            let p = source.playlist(&url).await.map_err(source_error)?;
            let rows = p
                .tracks
                .iter()
                .take(MAX_TRACKS)
                .map(|t| {
                    (
                        t.title.clone(),
                        t.artists.join(" • "),
                        t.album.clone(),
                        t.duration_ms,
                        t.isrc.clone(),
                        t.link.clone(),
                        t.id.clone(),
                    )
                })
                .collect();
            (
                p.source,
                p.id,
                Some(url),
                p.name,
                p.cover_url,
                p.total,
                rows,
            )
        };
    if rows.is_empty() {
        return Err(ApiError::bad("no songs"));
    }

    let into = body.into;
    // Completing with another playlist's address adds its songs; pasted links are the whole list.
    let append = url.is_some();
    let id = state
        .db
        .call(move |c| {
            let tx = c.transaction()?;
            let id = match into {
                // Completing an import: songs already looked for keep what was found.
                Some(into) => {
                    let found: Option<(String, Option<String>)> = tx
                        .query_row(
                            "SELECT source, name FROM playlist_import WHERE id = ?1 AND user_id = ?2",
                            [&into, &user],
                            |r| Ok((r.get(0)?, r.get(1)?)),
                        )
                        .optional()?;
                    let Some((old_source, _)) = found else {
                        return Ok(Err(ApiError(StatusCode::NOT_FOUND, "no such import".into())));
                    };
                    if old_source != source {
                        return Ok(Err(ApiError::bad("links of another service")));
                    }
                    if append {
                        let links: Vec<Option<String>> = tx
                            .prepare("SELECT link FROM playlist_import_track WHERE import_id = ?1")?
                            .query_map([&into], |r| r.get(0))?
                            .collect::<rusqlite::Result<_>>()?;
                        let mut next: i64 = tx.query_row(
                            "SELECT coalesce(max(position) + 1, 0) FROM playlist_import_track WHERE import_id = ?1",
                            [&into],
                            |r| r.get(0),
                        )?;
                        let mut ins = tx.prepare_cached(
                            "INSERT INTO playlist_import_track(import_id, position, title, artists, album, duration_ms, isrc, link, source_id)
                             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                        )?;
                        for r in &rows {
                            let already = r.5.as_ref().is_some_and(|l| links.iter().flatten().any(|k| same_link(k, l)));
                            if !already {
                                ins.execute(params![into, next, r.0, r.1, r.2, r.3, r.4, r.5, r.6])?;
                                next += 1;
                            }
                        }
                        drop(ins);
                        tx.execute(
                            "UPDATE playlist_import SET state = 'pending', error = NULL, updated_at = unixepoch() WHERE id = ?1",
                            [&into],
                        )?;
                        tx.commit()?;
                        return Ok(Ok(into));
                    }
                    let known: Vec<Known> = tx
                        .prepare(
                            "SELECT link, title, artists, album, duration_ms, isrc, source_id, status, reason, track_id
                               FROM playlist_import_track WHERE import_id = ?1 AND link IS NOT NULL AND status <> 'pending'",
                        )?
                        .query_map([&into], |r| {
                            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?, r.get(8)?, r.get(9)?))
                        })?
                        .collect::<rusqlite::Result<_>>()?;
                    tx.execute("DELETE FROM playlist_import_track WHERE import_id = ?1", [&into])?;
                    let mut ins = tx.prepare_cached(
                        "INSERT INTO playlist_import_track(import_id, position, title, artists, album, duration_ms, isrc, link, source_id, status, reason, track_id)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                    )?;
                    for (pos, r) in rows.iter().enumerate() {
                        let old = r.5.as_ref().and_then(|l| known.iter().find(|k| same_link(&k.0, l)));
                        match old {
                            Some(k) => ins.execute(params![into, pos as i64, k.1, k.2, k.3, k.4, k.5, r.5, k.6, k.7, k.8, k.9])?,
                            None => ins.execute(params![into, pos as i64, r.0, r.1, r.2, r.3, r.4, r.5, r.6, "pending", None::<String>, None::<String>])?,
                        };
                    }
                    drop(ins);
                    tx.execute(
                        "UPDATE playlist_import SET state = 'pending', error = NULL, source_total = NULL, updated_at = unixepoch(),
                                name = coalesce(?2, name)
                          WHERE id = ?1",
                        params![into, name],
                    )?;
                    into
                }
                None => {
                    let id = crate::ids::new_id();
                    let name = name.unwrap_or(title);
                    let name = if name.is_empty() { "Playlist".to_owned() } else { name };
                    tx.execute(
                        "INSERT INTO playlist_import(id, user_id, source, source_id, url, name, cover_url, source_total)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                        params![id, user, source, source_id, url, name, cover, source_total],
                    )?;
                    let mut ins = tx.prepare_cached(
                        "INSERT INTO playlist_import_track(import_id, position, title, artists, album, duration_ms, isrc, link, source_id)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                    )?;
                    for (pos, r) in rows.iter().enumerate() {
                        ins.execute(params![id, pos as i64, r.0, r.1, r.2, r.3, r.4, r.5, r.6])?;
                    }
                    drop(ins);
                    id
                }
            };
            tx.commit()?;
            Ok(Ok(id))
        })
        .await??;
    state.playlist_imports.wake();
    let detail = load(&state, &auth.user.id, &id, false).await?;
    Ok(Json(json!(detail.map(|d| d.import))))
}

/// Same song link, whatever its query (`?si=…`) or form.
fn same_link(a: &str, b: &str) -> bool {
    let key = |l: &str| {
        l.split(['?', '#'])
            .next()
            .unwrap_or_default()
            .trim_end_matches('/')
            .rsplit(['/', ':'])
            .next()
            .unwrap_or_default()
            .to_owned()
    };
    key(a) == key(b)
}

fn summary(c: &Connection, user: &str, id: Option<&str>) -> rusqlite::Result<Vec<PlaylistImport>> {
    let mut st = c.prepare_cached(
        "SELECT i.id, i.source, i.name, i.url, i.cover_url,
                (SELECT p.id FROM playlist p WHERE p.id = i.playlist_id), i.state, i.error,
                count(t.position), count(t.position) FILTER (WHERE t.status <> 'pending'),
                count(t.position) FILTER (WHERE t.status = 'library'),
                count(t.position) FILTER (WHERE t.status = 'online'),
                count(t.position) FILTER (WHERE t.status = 'uncertain'),
                count(t.position) FILTER (WHERE t.status = 'missing'),
                i.source_total, i.source_id, i.created_at, i.updated_at
           FROM playlist_import i LEFT JOIN playlist_import_track t ON t.import_id = i.id
          WHERE i.user_id = ?1 AND (?2 IS NULL OR i.id = ?2)
          GROUP BY i.id ORDER BY i.created_at DESC LIMIT 100",
    )?;
    st.query_map(params![user, id], |r| {
        let source: String = r.get(1)?;
        let source_id: Option<String> = r.get(15)?;
        Ok(PlaylistImport {
            id: r.get(0)?,
            app_link: app_link(&source, source_id.as_deref()),
            source,
            name: r.get(2)?,
            url: r.get(3)?,
            cover_url: r.get(4)?,
            playlist_id: r.get(5)?,
            state: r.get(6)?,
            error: r.get(7)?,
            total: r.get(8)?,
            done: r.get(9)?,
            library: r.get(10)?,
            online: r.get(11)?,
            uncertain: r.get(12)?,
            missing: r.get(13)?,
            source_total: r.get(14)?,
            created_at: r.get(16)?,
            updated_at: r.get(17)?,
        })
    })?
    .collect()
}

async fn load(
    state: &AppState,
    user: &str,
    id: &str,
    tracks: bool,
) -> Result<Option<PlaylistImportDetail>, ApiError> {
    let (user, id) = (user.to_owned(), id.to_owned());
    Ok(state
        .db
        .call(move |c| {
            let Some(import) = summary(c, &user, Some(&id))?.into_iter().next() else {
                return Ok(None);
            };
            let tracks = if tracks {
                c.prepare(
                    "SELECT position, title, artists, album, duration_ms, link, status, reason, track_id
                       FROM playlist_import_track WHERE import_id = ?1 ORDER BY position",
                )?
                .query_map([&id], |r| {
                    let artists: String = r.get(2)?;
                    Ok(PlaylistImportTrack {
                        position: r.get(0)?,
                        title: r.get(1)?,
                        artists: artists.split(" • ").filter(|a| !a.is_empty()).map(str::to_owned).collect(),
                        album: r.get(3)?,
                        duration_ms: r.get(4)?,
                        link: r.get(5)?,
                        status: r.get(6)?,
                        reason: r.get(7)?,
                        track_id: r.get(8)?,
                    })
                })?
                .collect::<rusqlite::Result<_>>()?
            } else {
                Vec::new()
            };
            Ok(Some(PlaylistImportDetail { import, tracks }))
        })
        .await?)
}

async fn list(State(state): State<AppState>, auth: Auth) -> Reply {
    let user = auth.user.id.clone();
    let out = state.db.call(move |c| Ok(summary(c, &user, None)?)).await?;
    Ok(Json(json!(out)))
}

async fn one(State(state): State<AppState>, auth: Auth, Path(id): Path<String>) -> Reply {
    let d = load(&state, &auth.user.id, &id, true)
        .await?
        .ok_or_else(|| ApiError(StatusCode::NOT_FOUND, "no such import".into()))?;
    Ok(Json(json!(d)))
}

/// The songs not found are looked for again (the search improves, a service was down…).
async fn retry(State(state): State<AppState>, auth: Auth, Path(id): Path<String>) -> Reply {
    let (user, iid) = (auth.user.id.clone(), id.clone());
    let n = state
        .db
        .call(move |c| {
            let tx = c.transaction()?;
            let mine = tx
                .query_row(
                    "SELECT 1 FROM playlist_import WHERE id = ?1 AND user_id = ?2 AND state IN ('done', 'failed')",
                    [&iid, &user],
                    |_| Ok(()),
                )
                .optional()?
                .is_some();
            if !mine {
                return Ok(None);
            }
            let n = tx.execute(
                "UPDATE playlist_import_track SET status = 'pending', reason = NULL, track_id = NULL
                  WHERE import_id = ?1 AND status = 'missing' AND title <> ''",
                [&iid],
            )?;
            if n > 0 {
                tx.execute(
                    "UPDATE playlist_import SET state = 'pending', error = NULL, updated_at = unixepoch() WHERE id = ?1",
                    [&iid],
                )?;
            }
            tx.commit()?;
            Ok(Some(n))
        })
        .await?
        .ok_or_else(|| ApiError(StatusCode::NOT_FOUND, "no such import, or not done".into()))?;
    state.playlist_imports.wake();
    Ok(Json(json!({ "retried": n })))
}

async fn remove(State(state): State<AppState>, auth: Auth, Path(id): Path<String>) -> Reply {
    let user = auth.user.id.clone();
    let n = state
        .db
        .call(move |c| {
            Ok(c.execute(
                "DELETE FROM playlist_import WHERE id = ?1 AND user_id = ?2",
                [&id, &user],
            )?)
        })
        .await?;
    if n == 0 {
        return Err(ApiError(StatusCode::NOT_FOUND, "no such import".into()));
    }
    Ok(Json(json!({})))
}
