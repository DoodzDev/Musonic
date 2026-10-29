//! Podcasts over Subsonic (ADR-023): the standard routes, which other clients know too, and
//! Musonic's directory search. A show the account follows is a « channel »; its episodes play
//! through `stream` like songs (`pe-…` ids), relayed from the host or read from the server's
//! copy, and their pictures through `getCoverArt`.
//!
//! | Route | |
//! |---|---|
//! | `getPodcasts?id=&includeEpisodes=` | shows the account follows, with their episodes |
//! | `getNewestPodcasts?count=` | latest episodes of those shows |
//! | `getPodcastEpisode?id=` | one episode (OpenSubsonic) |
//! | `createPodcastChannel?url=` | follows a show by its feed |
//! | `deletePodcastChannel?id=` | stops following it |
//! | `refreshPodcasts` | reads the feeds again (in the background) |
//! | `searchPodcasts?query=&country=` | Musonic: shows in the directory, and which are followed |
//! | `savePodcastPosition?id=&position=` | Musonic: where the account stopped in an episode (ms) |

use axum::{
    body::Body,
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::Response,
};
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Map, Value, json};

use super::{ApiError, Code, Ctx, Reply, model, one};
use crate::podcasts::net;

/// Episodes sent with a show in `getPodcasts` (a long-running show has thousands).
const EPISODES_SHOWN: i64 = 300;

const EPISODE_COLUMNS: &str = "e.id, e.podcast_id, e.title, e.description, e.published_at, e.duration_s,
     e.audio_size, e.audio_type, e.image_url IS NOT NULL, coalesce(s.position_ms, 0), coalesce(s.played, 0)";

fn episode(r: &rusqlite::Row) -> rusqlite::Result<Value> {
    let id: String = r.get(0)?;
    let channel: String = r.get(1)?;
    let own_picture: bool = r.get(8)?;
    let content_type: Option<String> = r.get(7)?;
    let mut m = Map::new();
    m.insert("id".into(), json!(id));
    m.insert("streamId".into(), json!(id));
    m.insert("channelId".into(), json!(channel));
    m.insert("title".into(), json!(r.get::<_, String>(2)?));
    if let Some(d) = r.get::<_, Option<String>>(3)? {
        m.insert("description".into(), json!(d));
    }
    if let Some(t) = r.get::<_, Option<i64>>(4)? {
        m.insert("publishDate".into(), json!(model::iso(t)));
    }
    if let Some(d) = r.get::<_, Option<i64>>(5)? {
        m.insert("duration".into(), json!(d));
    }
    if let Some(s) = r.get::<_, Option<i64>>(6)? {
        m.insert("size".into(), json!(s));
    }
    let suffix = match content_type.as_deref() {
        Some("audio/mp4" | "audio/x-m4a" | "audio/aac") => "m4a",
        Some("audio/ogg" | "audio/opus") => "ogg",
        _ => "mp3",
    };
    m.insert(
        "contentType".into(),
        json!(content_type.as_deref().unwrap_or("audio/mpeg")),
    );
    m.insert("suffix".into(), json!(suffix));
    // « completed »: playable now (clients only play those); the server relays the host.
    m.insert("status".into(), json!("completed"));
    m.insert("isDir".into(), json!(false));
    m.insert(
        "coverArt".into(),
        json!(if own_picture { id } else { channel }),
    );
    // Musonic: where this account stopped (ms), and whether it was listened to the end.
    m.insert("position".into(), json!(r.get::<_, i64>(9)?));
    m.insert("played".into(), json!(r.get::<_, bool>(10)?));
    Ok(Value::Object(m))
}

/// id, feed, title, description, picture, last error.
type ChannelRow = (
    String,
    String,
    String,
    Option<String>,
    Option<String>,
    Option<String>,
);

fn episodes_of(
    c: &Connection,
    user: &str,
    podcast: &str,
    limit: i64,
) -> rusqlite::Result<Vec<Value>> {
    let mut st = c.prepare_cached(&format!(
        "SELECT {EPISODE_COLUMNS} FROM episode e
           LEFT JOIN episode_state s ON s.episode_id = e.id AND s.user_id = ?1
          WHERE e.podcast_id = ?2 ORDER BY e.published_at DESC LIMIT ?3"
    ))?;
    st.query_map(params![user, podcast, limit], episode)?
        .collect()
}

pub async fn get_podcasts(ctx: &Ctx) -> Reply {
    let user = ctx.user.id.clone();
    let only = ctx.params.get("id").map(str::to_owned);
    let with_episodes = ctx.params.get("includeEpisodes") != Some("false");
    let channels = ctx
        .state
        .db
        .call(move |c| {
            let mut st = c.prepare_cached(
                "SELECT p.id, p.feed_url, p.title, p.description, p.image_url, p.error
                   FROM podcast p JOIN podcast_subscription s ON s.podcast_id = p.id AND s.user_id = ?1
                  WHERE ?2 IS NULL OR p.id = ?2
                  ORDER BY p.title COLLATE NOCASE",
            )?;
            let rows: Vec<ChannelRow> = st
                .query_map(params![user, only], |r| {
                    Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?))
                })?
                .collect::<rusqlite::Result<_>>()?;
            let mut out = Vec::new();
            for (id, url, title, description, image, error) in rows {
                let mut m = Map::new();
                m.insert("id".into(), json!(id));
                m.insert("url".into(), json!(url));
                m.insert("title".into(), json!(title));
                if let Some(d) = description {
                    m.insert("description".into(), json!(d));
                }
                if let Some(i) = image {
                    m.insert("originalImageUrl".into(), json!(i));
                }
                m.insert("coverArt".into(), json!(id));
                m.insert("status".into(), json!(if error.is_some() { "error" } else { "completed" }));
                if let Some(e) = error {
                    m.insert("errorMessage".into(), json!(e));
                }
                if with_episodes {
                    m.insert("episode".into(), json!(episodes_of(c, &user, &id, EPISODES_SHOWN)?));
                }
                out.push(Value::Object(m));
            }
            Ok(out)
        })
        .await?;
    if ctx.params.has("id") && channels.is_empty() {
        return Err(ApiError::not_found("Podcast"));
    }
    Ok(one("podcasts", json!({ "channel": channels })))
}

pub async fn get_newest(ctx: &Ctx) -> Reply {
    let user = ctx.user.id.clone();
    let count: i64 = ctx
        .params
        .get("count")
        .and_then(|v| v.parse().ok())
        .unwrap_or(20)
        .clamp(1, 500);
    let episodes = ctx
        .state
        .db
        .call(move |c| {
            let mut st = c.prepare_cached(&format!(
                "SELECT {EPISODE_COLUMNS} FROM episode e
                   JOIN podcast_subscription f ON f.podcast_id = e.podcast_id AND f.user_id = ?1
                   LEFT JOIN episode_state s ON s.episode_id = e.id AND s.user_id = ?1
                  ORDER BY e.published_at DESC LIMIT ?2"
            ))?;
            Ok(st
                .query_map(params![user, count], episode)?
                .collect::<rusqlite::Result<Vec<_>>>()?)
        })
        .await?;
    Ok(one("newestPodcasts", json!({ "episode": episodes })))
}

pub async fn get_episode(ctx: &Ctx) -> Reply {
    let id = ctx.params.require("id")?.to_owned();
    let user = ctx.user.id.clone();
    let found = ctx
        .state
        .db
        .call(move |c| {
            let mut st = c.prepare_cached(&format!(
                "SELECT {EPISODE_COLUMNS} FROM episode e
                   LEFT JOIN episode_state s ON s.episode_id = e.id AND s.user_id = ?1
                  WHERE e.id = ?2"
            ))?;
            Ok(st
                .query_map(params![user, id], episode)?
                .next()
                .transpose()?)
        })
        .await?;
    found
        .map(|e| one("podcastEpisode", e))
        .ok_or_else(|| ApiError::not_found("Episode"))
}

pub async fn create_channel(ctx: &Ctx) -> Reply {
    let url = ctx.params.require("url")?;
    ctx.state
        .podcasts
        .subscribe(&ctx.user.id, url)
        .await
        .map_err(|e| ApiError::new(Code::Generic, format!("Podcast feed unavailable: {e}")))?;
    Ok(Map::new())
}

pub async fn delete_channel(ctx: &Ctx) -> Reply {
    let id = ctx.params.require("id")?;
    if !ctx.state.podcasts.unsubscribe(&ctx.user.id, id).await? {
        return Err(ApiError::not_found("Podcast"));
    }
    Ok(Map::new())
}

pub async fn refresh(ctx: &Ctx) -> Reply {
    let podcasts = ctx.state.podcasts.clone();
    tokio::spawn(async move {
        podcasts.refresh_all().await;
    });
    Ok(Map::new())
}

pub async fn search(ctx: &Ctx) -> Reply {
    let query = ctx.params.require("query")?;
    let found = ctx
        .state
        .podcasts
        .search(query, ctx.params.get("country"))
        .await
        .map_err(|e| ApiError::new(Code::Generic, format!("Podcast directory unavailable: {e}")))?;
    let user = ctx.user.id.clone();
    let urls: Vec<String> = found.iter().map(|f| f.feed_url.clone()).collect();
    let followed: Vec<bool> = ctx
        .state
        .db
        .call(move |c| {
            let mut st = c.prepare_cached(
                "SELECT EXISTS (SELECT 1 FROM podcast p JOIN podcast_subscription s ON s.podcast_id = p.id
                                 WHERE p.feed_url = ?1 AND s.user_id = ?2)",
            )?;
            urls.iter()
                .map(|u| st.query_row(params![u, user], |r| r.get(0)))
                .collect::<rusqlite::Result<_>>()
                .map_err(Into::into)
        })
        .await?;
    let shows: Vec<Value> = found
        .into_iter()
        .zip(followed)
        .map(|(f, followed)| {
            let mut v = json!(f);
            v["id"] = json!(crate::ids::podcast_id(&f.feed_url));
            v["followed"] = json!(followed);
            v
        })
        .collect();
    Ok(one("searchPodcasts", json!({ "podcast": shows })))
}

/// Listened to the end: past 95 %, or less than a minute left.
fn played(position_ms: i64, duration_s: Option<i64>) -> bool {
    duration_s.is_some_and(|d| d > 0 && (position_ms >= d * 950 || d * 1000 - position_ms < 60_000))
}

pub async fn save_position(ctx: &Ctx) -> Reply {
    let id = ctx.params.require("id")?.to_owned();
    let position: i64 = ctx
        .params
        .require("position")?
        .parse()
        .map_err(|_| ApiError::new(Code::Generic, "position: milliseconds"))?;
    let user = ctx.user.id.clone();
    let saved = ctx
        .state
        .db
        .call(move |c| {
            let duration: Option<Option<i64>> = c
                .query_row("SELECT duration_s FROM episode WHERE id = ?1", [&id], |r| {
                    r.get(0)
                })
                .optional()?;
            let Some(duration) = duration else {
                return Ok(false);
            };
            c.execute(
                "INSERT INTO episode_state(user_id, episode_id, position_ms, played, updated_at)
                 VALUES (?1, ?2, ?3, ?4, unixepoch())
                 ON CONFLICT(user_id, episode_id) DO UPDATE SET
                   position_ms = excluded.position_ms, played = max(played, excluded.played),
                   updated_at = unixepoch()",
                params![user, id, position.max(0), played(position, duration)],
            )?;
            Ok(true)
        })
        .await?;
    if !saved {
        return Err(ApiError::not_found("Episode"));
    }
    Ok(Map::new())
}

/// Plays an episode: the server's copy when there is one, else the host's file relayed
/// (with `Range`, so seeking works). The host never sees the listener's address.
pub async fn stream(ctx: &Ctx, id: &str) -> Result<Response, ApiError> {
    let id = id.to_owned();
    let found: Option<(String, Option<String>)> = ctx
        .state
        .db
        .call(move |c| {
            Ok(c.query_row(
                "SELECT audio_url, local_path FROM episode WHERE id = ?1",
                [&id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?)
        })
        .await?;
    let Some((url, local)) = found else {
        return Err(ApiError::not_found("Episode"));
    };
    if let Some(rel) = local {
        let path = ctx.state.data_dir.join(rel);
        if let Ok(meta) = tokio::fs::metadata(&path).await {
            return Ok(super::media::send_file(ctx, &path, "audio/mpeg", meta.len(), None).await);
        }
    }
    let url = reqwest::Url::parse(&url).map_err(|_| ApiError::not_found("Episode"))?;
    net::check(&url)
        .await
        .map_err(|_| ApiError::not_found("Episode"))?;
    let mut req = ctx.state.podcasts.http().get(url);
    if let Some(range) = ctx.headers.get(header::RANGE) {
        req = req.header(header::RANGE, range.clone());
    }
    let res = req.send().await.map_err(|e| {
        ApiError::new(
            Code::Generic,
            format!("Podcast host unavailable: {}", e.without_url()),
        )
    })?;
    if !res.status().is_success() {
        return Err(ApiError::new(
            Code::Generic,
            format!("Podcast host answered {}", res.status()),
        ));
    }
    let mut headers = HeaderMap::new();
    for name in [
        header::CONTENT_TYPE,
        header::CONTENT_LENGTH,
        header::CONTENT_RANGE,
        header::ACCEPT_RANGES,
    ] {
        if let Some(v) = res.headers().get(&name) {
            headers.insert(name, v.clone());
        }
    }
    headers
        .entry(header::ACCEPT_RANGES)
        .or_insert(HeaderValue::from_static("bytes"));
    let status = StatusCode::from_u16(res.status().as_u16()).unwrap_or(StatusCode::OK);
    let mut out = Response::new(Body::from_stream(res.bytes_stream()));
    *out.status_mut() = status;
    *out.headers_mut() = headers;
    Ok(out)
}
