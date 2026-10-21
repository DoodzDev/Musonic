//! The console's « Bibliothèque » page (tranche C5): scans, browsing the songs with their
//! files, the lists to look at (missing files, no cover, duplicates), listening to check a file.
//!
//! | Route | |
//! |---|---|
//! | `GET /v1/admin/library` | Scan state and the size of each list |
//! | `POST /v1/admin/library/scan` | `{full}`: scan now (full = read every file again) |
//! | `GET /v1/admin/library/tracks` | Songs (`q`, `filter`: `missing`, `nocover`, `duplicates`, `online`; `offset`, `limit`) |
//! | `GET /v1/admin/library/tracks/{id}` | One song: tags, files, sources, likes and plays |
//! | `GET /v1/admin/library/files/{id}?token=` | The file itself (to listen), ranges allowed |

use std::{collections::HashMap, path::PathBuf};

use axum::{
    Json, Router,
    extract::{Path, Query, Request, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tower::ServiceExt;
use ts_rs::TS;

use super::{ApiError, Auth, Reply};
use crate::server::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/v1/admin/library", get(overview))
        .route("/v1/admin/library/scan", post(scan))
        .route("/v1/admin/library/tracks", get(tracks))
        .route("/v1/admin/library/tracks/{id}", get(track))
        .route("/v1/admin/library/files/{id}", get(file))
}

fn admin(auth: &Auth) -> Result<(), ApiError> {
    if auth.user.is_admin {
        Ok(())
    } else {
        Err(ApiError::forbidden())
    }
}

/// Songs whose file is gone.
const MISSING: &str =
    "EXISTS (SELECT 1 FROM track_file f WHERE f.track_id = t.id AND f.missing = 1)
     AND NOT EXISTS (SELECT 1 FROM track_file f WHERE f.track_id = t.id AND f.missing = 0)";
/// Songs with a file but no picture in it nor online (a picture in the folder is checked after).
const NO_COVER: &str = "EXISTS (SELECT 1 FROM track_file f WHERE f.track_id = t.id AND f.missing = 0)
     AND NOT EXISTS (SELECT 1 FROM track_file f WHERE f.track_id = t.id AND f.missing = 0 AND f.has_cover = 1)
     AND t.cover_url IS NULL
     AND NOT EXISTS (SELECT 1 FROM album al WHERE al.id = t.album_id AND al.cover_url IS NOT NULL)";
/// The same song twice: two files, or two songs with the same title and artists.
const DUPLICATES: &str = "(SELECT count(*) FROM track_file f WHERE f.track_id = t.id AND f.missing = 0) > 1
     OR (EXISTS (SELECT 1 FROM track_file f WHERE f.track_id = t.id AND f.missing = 0)
         AND EXISTS (SELECT 1 FROM track o WHERE o.id <> t.id AND o.norm_title = t.norm_title
                     AND o.norm_artists = t.norm_artists
                     AND EXISTS (SELECT 1 FROM track_file f WHERE f.track_id = o.id AND f.missing = 0)))";
/// Online songs (liked, in a playlist) without a file.
const ONLINE: &str = "NOT EXISTS (SELECT 1 FROM track_file f WHERE f.track_id = t.id)";

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct LibraryOverview {
    /// A music folder is set.
    pub enabled: bool,
    pub scanning: bool,
    #[ts(type = "number | null")]
    pub last_scan_at: Option<i64>,
    /// Songs added, changed, removed by the last scan.
    #[ts(type = "Record<string, number> | null")]
    pub last_scan: Option<serde_json::Value>,
    pub tracks: u32,
    pub missing: u32,
    pub no_cover: u32,
    pub duplicates: u32,
    pub online: u32,
}

/// Folders holding a picture (cover.jpg, folder.png…), relative to the library root.
fn folders_with_picture(
    root: &std::path::Path,
    folders: impl Iterator<Item = String>,
) -> HashMap<String, bool> {
    let mut out = HashMap::new();
    for folder in folders {
        out.entry(folder.clone()).or_insert_with(|| {
            std::fs::read_dir(root.join(&folder))
                .map(|entries| {
                    entries.filter_map(Result::ok).any(|e| {
                        let name = e.file_name().to_string_lossy().to_lowercase();
                        [".jpg", ".jpeg", ".png", ".webp"]
                            .iter()
                            .any(|x| name.ends_with(x))
                    })
                })
                .unwrap_or(false)
        });
    }
    out
}

fn parent(path: &str) -> String {
    path.rsplit_once('/')
        .map(|(d, _)| d.to_owned())
        .unwrap_or_default()
}

/// Songs without a picture anywhere: (id, path of its file).
async fn without_cover(state: &AppState) -> Result<Vec<String>, ApiError> {
    let rows: Vec<(String, String)> = state
        .db
        .call(|c| {
            Ok(c.prepare(&format!(
                "SELECT t.id, (SELECT path FROM track_file f WHERE f.track_id = t.id AND f.missing = 0 LIMIT 1)
                   FROM track t WHERE {NO_COVER}"
            ))?
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<rusqlite::Result<_>>()?)
        })
        .await?;
    let Some(root) = state.music_dir.clone() else {
        return Ok(rows.into_iter().map(|(id, _)| id).collect());
    };
    Ok(tokio::task::spawn_blocking(move || {
        let pictures = folders_with_picture(&root, rows.iter().map(|(_, p)| parent(p)));
        rows.into_iter()
            .filter(|(_, p)| !pictures.get(&parent(p)).copied().unwrap_or(false))
            .map(|(id, _)| id)
            .collect()
    })
    .await
    .map_err(anyhow::Error::from)?)
}

async fn overview(State(state): State<AppState>, auth: Auth) -> Reply {
    admin(&auth)?;
    let no_cover = without_cover(&state).await?.len() as u32;
    let (tracks, missing, duplicates, online, last_scan_at) = state
        .db
        .call(|c| {
            let n = |cond: &str| -> rusqlite::Result<u32> {
                c.query_row(
                    &format!("SELECT count(*) FROM track t WHERE {cond}"),
                    [],
                    |r| r.get(0),
                )
            };
            Ok((
                n("EXISTS (SELECT 1 FROM track_file f WHERE f.track_id = t.id AND f.missing = 0)")?,
                n(MISSING)?,
                n(DUPLICATES)?,
                n(ONLINE)?,
                c.query_row("SELECT max(last_scan_at) FROM library", [], |r| {
                    r.get::<_, Option<i64>>(0)
                })?,
            ))
        })
        .await?;
    let status = state.library.as_ref().map(|l| l.status());
    Ok(Json(json!(LibraryOverview {
        enabled: state.library.is_some(),
        scanning: status.as_ref().is_some_and(|s| s.scanning),
        last_scan_at,
        last_scan: status.and_then(|s| s.last).map(|s| json!(s)),
        tracks,
        missing,
        no_cover,
        duplicates,
        online,
    })))
}

#[derive(Deserialize)]
struct ScanBody {
    #[serde(default)]
    full: bool,
}

async fn scan(State(state): State<AppState>, auth: Auth, Json(body): Json<ScanBody>) -> Reply {
    admin(&auth)?;
    let Some(lib) = &state.library else {
        return Err(ApiError::bad("no music folder"));
    };
    lib.request(body.full);
    state.journal.log(
        crate::journal::Entry::new("library.scan")
            .by_admin(&auth.user.username)
            .detail(if body.full { "full" } else { "quick" }),
    );
    Ok(Json(json!({})))
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct TrackQuery {
    q: Option<String>,
    filter: Option<String>,
    offset: u32,
    limit: Option<u32>,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TrackRow {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    #[ts(type = "number")]
    pub duration_ms: i64,
    pub format: Option<String>,
    pub bit_rate: Option<u32>,
    #[ts(type = "number | null")]
    pub size: Option<i64>,
    pub path: Option<String>,
    /// The file to listen to (`/v1/admin/library/files/{fileId}`), when there is one.
    pub file_id: Option<String>,
    /// `file`, `missing` (file gone), `online` (no file).
    pub source: String,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TrackPage {
    pub tracks: Vec<TrackRow>,
    pub total: u32,
}

async fn tracks(State(state): State<AppState>, auth: Auth, Query(q): Query<TrackQuery>) -> Reply {
    admin(&auth)?;
    let filter = q.filter.unwrap_or_default();
    // No cover is partly decided on disk: those songs' ids.
    let ids = if filter == "nocover" {
        Some(without_cover(&state).await?)
    } else {
        None
    };
    let page = state
        .db
        .call(move |c| {
            const FROM: &str = " FROM track t LEFT JOIN album a ON a.id = t.album_id";
            let mut cond = String::from("1");
            let mut args: Vec<String> = Vec::new();
            match filter.as_str() {
                "missing" => cond += &format!(" AND {MISSING}"),
                "duplicates" => cond += &format!(" AND ({DUPLICATES})"),
                "online" => cond += &format!(" AND {ONLINE}"),
                "nocover" => {
                    let ids = ids.unwrap_or_default();
                    if ids.is_empty() {
                        cond += " AND 0";
                    } else {
                        cond += &format!(" AND t.id IN ({})", vec!["?"; ids.len()].join(","));
                        args.extend(ids);
                    }
                }
                _ => cond += " AND EXISTS (SELECT 1 FROM track_file f WHERE f.track_id = t.id)",
            }
            if let Some(text) = q.q.map(|s| s.trim().to_owned()).filter(|s| !s.is_empty()) {
                cond += " AND (t.title LIKE ? OR t.artist_display LIKE ? OR a.title LIKE ?
                              OR EXISTS (SELECT 1 FROM track_file f WHERE f.track_id = t.id AND f.path LIKE ?))";
                args.extend(std::iter::repeat_n(format!("%{text}%"), 4));
            }
            let total: u32 = c.query_row(
                &format!("SELECT count(*){FROM} WHERE {cond}"),
                rusqlite::params_from_iter(&args),
                |r| r.get(0),
            )?;
            let limit = q.limit.unwrap_or(100).clamp(1, 500);
            let order = if filter == "duplicates" {
                "t.norm_artists, t.norm_title, t.id"
            } else {
                "t.artist_display COLLATE NOCASE, a.title COLLATE NOCASE, t.disc_number, t.track_number, t.title"
            };
            let tracks = c
                .prepare(&format!(
                    "SELECT t.id, t.title, t.artist_display, a.title, t.duration_ms,
                            f.format, f.bit_rate, f.size, f.path, f.missing, f.id
                       {FROM}
                       LEFT JOIN track_file f ON f.id = (SELECT id FROM track_file x WHERE x.track_id = t.id
                                                          ORDER BY x.missing, x.updated_at DESC LIMIT 1)
                      WHERE {cond}
                      ORDER BY {order} LIMIT {limit} OFFSET {}",
                    q.offset
                ))?
                .query_map(rusqlite::params_from_iter(&args), |r| {
                    let missing: Option<bool> = r.get(9)?;
                    Ok(TrackRow {
                        id: r.get(0)?,
                        title: r.get(1)?,
                        artist: r.get(2)?,
                        album: r.get(3)?,
                        duration_ms: r.get(4)?,
                        format: r.get(5)?,
                        bit_rate: r.get(6)?,
                        size: r.get(7)?,
                        path: r.get(8)?,
                        file_id: r.get(10)?,
                        source: match missing {
                            None => "online",
                            Some(true) => "missing",
                            Some(false) => "file",
                        }
                        .to_owned(),
                    })
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(TrackPage { tracks, total })
        })
        .await?;
    Ok(Json(json!(page)))
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TrackFile {
    pub id: String,
    pub path: String,
    #[ts(type = "number")]
    pub size: i64,
    pub format: String,
    pub bit_rate: Option<u32>,
    pub sample_rate: Option<u32>,
    pub bit_depth: Option<u32>,
    pub channels: Option<u32>,
    pub has_cover: bool,
    pub missing: bool,
    /// Brought by an import (path under the imports folder).
    pub imported: bool,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TrackDetail {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub year: Option<i32>,
    pub disc_number: Option<u32>,
    pub track_number: Option<u32>,
    #[ts(type = "number")]
    pub duration_ms: i64,
    pub isrc: Option<String>,
    pub genres: Vec<String>,
    pub files: Vec<TrackFile>,
    /// Online catalogs knowing it: `deezer:3135556`.
    pub sources: Vec<String>,
    pub likes: u32,
    pub plays: u32,
    #[ts(type = "number")]
    pub created_at: i64,
}

async fn track(State(state): State<AppState>, auth: Auth, Path(id): Path<String>) -> Reply {
    admin(&auth)?;
    let import_prefix = format!("{}/", state.import_dir.trim_end_matches('/'));
    let detail = state
        .db
        .call(move |c| {
            let Some(mut d) = c
                .query_row(
                    "SELECT t.id, t.title, t.artist_display, a.title, a.artist_display, t.year,
                            t.disc_number, t.track_number, t.duration_ms, t.isrc, t.created_at
                       FROM track t LEFT JOIN album a ON a.id = t.album_id WHERE t.id = ?1",
                    [&id],
                    |r| {
                        Ok(TrackDetail {
                            id: r.get(0)?,
                            title: r.get(1)?,
                            artist: r.get(2)?,
                            album: r.get(3)?,
                            album_artist: r.get(4)?,
                            year: r.get(5)?,
                            disc_number: r.get(6)?,
                            track_number: r.get(7)?,
                            duration_ms: r.get(8)?,
                            isrc: r.get(9)?,
                            genres: Vec::new(),
                            files: Vec::new(),
                            sources: Vec::new(),
                            likes: 0,
                            plays: 0,
                            created_at: r.get(10)?,
                        })
                    },
                )
                .ok()
            else {
                return Ok(None);
            };
            d.genres = c
                .prepare("SELECT g.name FROM track_genre tg JOIN genre g ON g.id = tg.genre_id WHERE tg.track_id = ?1")?
                .query_map([&id], |r| r.get(0))?
                .collect::<rusqlite::Result<_>>()?;
            d.files = c
                .prepare(
                    "SELECT id, path, size, format, bit_rate, sample_rate, bit_depth, channels, has_cover, missing
                       FROM track_file WHERE track_id = ?1 ORDER BY missing, path",
                )?
                .query_map([&id], |r| {
                    let path: String = r.get(1)?;
                    Ok(TrackFile {
                        id: r.get(0)?,
                        imported: path.starts_with(&import_prefix),
                        path,
                        size: r.get(2)?,
                        format: r.get(3)?,
                        bit_rate: r.get(4)?,
                        sample_rate: r.get(5)?,
                        bit_depth: r.get(6)?,
                        channels: r.get(7)?,
                        has_cover: r.get(8)?,
                        missing: r.get(9)?,
                    })
                })?
                .collect::<rusqlite::Result<_>>()?;
            d.sources = c
                .prepare("SELECT provider || ':' || provider_id FROM track_source WHERE track_id = ?1")?
                .query_map([&id], |r| r.get(0))?
                .collect::<rusqlite::Result<_>>()?;
            (d.likes, d.plays) = c.query_row(
                "SELECT count(starred_at), coalesce(sum(play_count), 0) FROM annotation
                  WHERE item_type = 'track' AND item_id = ?1",
                [&id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )?;
            Ok(Some(d))
        })
        .await?
        .ok_or_else(|| ApiError(StatusCode::NOT_FOUND, "no such song".into()))?;
    Ok(Json(json!(detail)))
}

#[derive(Deserialize)]
struct TokenQuery {
    token: Option<String>,
}

/// The file, for the console's player (an `<audio>` cannot send a header: token in the address).
async fn file(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(q): Query<TokenQuery>,
    req: Request,
) -> Result<Response, ApiError> {
    let token = q.token.unwrap_or_default();
    let user = super::user_of(&state, &token)
        .await?
        .ok_or_else(ApiError::unauthorized)?;
    if !user.is_admin {
        return Err(ApiError::forbidden());
    }
    let Some(root) = state.music_dir.clone() else {
        return Err(ApiError(StatusCode::NOT_FOUND, "no music folder".into()));
    };
    let path: Option<String> = state
        .db
        .call(move |c| {
            Ok(c.query_row(
                "SELECT path FROM track_file WHERE id = ?1 AND missing = 0",
                [&id],
                |r| r.get(0),
            )
            .ok())
        })
        .await?;
    let Some(rel) = path else {
        return Err(ApiError(StatusCode::NOT_FOUND, "no such file".into()));
    };
    let full: PathBuf = root.join(rel);
    Ok(tower_http::services::ServeFile::new(full)
        .oneshot(req)
        .await
        .map_err(|e| anyhow::anyhow!(e))?
        .into_response())
}
