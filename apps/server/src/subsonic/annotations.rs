//! Likes, ratings, plays (scrobbles) and what is playing now.

use std::{
    collections::HashMap,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::{Connection, OptionalExtension, Transaction, params};
use serde_json::json;

use super::{ApiError, Code, Ctx, Reply, model, one, online};

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or_default()
}

/// What an `id` names: a track, an album or an artist (old clients send all three as `id`).
fn item_type(c: &Connection, id: &str) -> rusqlite::Result<Option<&'static str>> {
    for (kind, table) in [("track", "track"), ("album", "album"), ("artist", "artist")] {
        let found = c
            .prepare_cached(&format!("SELECT 1 FROM {table} WHERE id = ?1"))?
            .query_row([id], |_| Ok(()))
            .optional()?;
        if found.is_some() {
            return Ok(Some(kind));
        }
    }
    Ok(None)
}

/// The items of a `star` / `unstar` call: `id` (any kind), `albumId`, `artistId`.
fn targets(ctx: &Ctx) -> Result<Vec<(Option<&'static str>, String)>, ApiError> {
    let mut all: Vec<(Option<&'static str>, String)> = Vec::new();
    for (name, kind) in [
        ("id", None),
        ("albumId", Some("album")),
        ("artistId", Some("artist")),
    ] {
        all.extend(
            ctx.params
                .all(name)
                .into_iter()
                .filter(|v| !v.is_empty())
                .map(|v| (kind, v.to_owned())),
        );
    }
    if all.is_empty() {
        return Err(ApiError::missing("id"));
    }
    Ok(all)
}

/// Resolves every target in `tx`; `Err` names the first unknown one.
fn resolve(
    tx: &Transaction,
    targets: &[(Option<&'static str>, String)],
) -> rusqlite::Result<Result<Vec<(&'static str, String)>, String>> {
    let mut out = Vec::with_capacity(targets.len());
    for (kind, id) in targets {
        match (kind, item_type(tx, id)?) {
            (None, Some(found)) => out.push((found, id.clone())),
            (Some(want), Some(found)) if *want == found => out.push((found, id.clone())),
            _ => return Ok(Err(id.clone())),
        }
    }
    Ok(Ok(out))
}

pub async fn star(ctx: &Ctx, starred: bool) -> Reply {
    let mut targets = targets(ctx)?;
    // Online songs are stored first, then liked under their library id.
    let ids = targets.iter().map(|(_, id)| id.clone()).collect();
    for ((_, id), resolved) in targets
        .iter_mut()
        .zip(online::resolve_tracks(ctx, ids).await?)
    {
        *id = resolved;
    }
    let user = ctx.user.id.clone();
    let result = ctx
        .state
        .db
        .call(move |c| {
            let tx = c.transaction()?;
            let items = match resolve(&tx, &targets)? {
                Ok(items) => items,
                Err(id) => return Ok(Err(id)),
            };
            for (kind, id) in items {
                if starred {
                    // Liking again keeps the first date.
                    tx.prepare_cached(
                        "INSERT INTO annotation(user_id, item_type, item_id, starred_at)
                         VALUES (?1, ?2, ?3, ?4)
                         ON CONFLICT(user_id, item_type, item_id)
                         DO UPDATE SET starred_at = coalesce(starred_at, excluded.starred_at)",
                    )?
                    .execute(params![user, kind, id, now()])?;
                } else {
                    tx.prepare_cached(
                        "UPDATE annotation SET starred_at = NULL
                          WHERE user_id = ?1 AND item_type = ?2 AND item_id = ?3",
                    )?
                    .execute(params![user, kind, id])?;
                }
            }
            tx.commit()?;
            Ok(Ok(()))
        })
        .await?;
    result.map_err(|id| ApiError::new(Code::NotFound, format!("Item not found: {id}")))?;
    Ok(Default::default())
}

pub async fn set_rating(ctx: &Ctx) -> Reply {
    let id = ctx.params.require("id")?.to_owned();
    let id = online::resolve_tracks(ctx, vec![id]).await?.remove(0);
    let rating: i64 = ctx
        .params
        .require("rating")?
        .parse()
        .ok()
        .filter(|r| (0..=5).contains(r))
        .ok_or_else(|| ApiError::new(Code::Generic, "rating must be between 0 and 5"))?;
    let user = ctx.user.id.clone();
    let found = ctx
        .state
        .db
        .call(move |c| {
            let Some(kind) = item_type(c, &id)? else {
                return Ok(false);
            };
            c.prepare_cached(
                "INSERT INTO annotation(user_id, item_type, item_id, rating) VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(user_id, item_type, item_id) DO UPDATE SET rating = excluded.rating",
            )?
            .execute(params![user, kind, id, rating])?;
            Ok(true)
        })
        .await?;
    if !found {
        return Err(ApiError::not_found("Item"));
    }
    Ok(Default::default())
}

/// Counts one play of `track` at `at` for the track, its album and its artists.
fn count_play(
    tx: &Transaction,
    user: &str,
    track: &str,
    at: i64,
    client: Option<&str>,
) -> rusqlite::Result<()> {
    const UPSERT: &str = "ON CONFLICT(user_id, item_type, item_id) DO UPDATE SET
        play_count = play_count + 1,
        last_played_at = max(coalesce(last_played_at, 0), excluded.last_played_at)";
    tx.prepare_cached(&format!(
        "INSERT INTO annotation(user_id, item_type, item_id, play_count, last_played_at)
         VALUES (?1, 'track', ?2, 1, ?3) {UPSERT}"
    ))?
    .execute(params![user, track, at])?;
    // An upsert after `SELECT … FROM` needs a `WHERE` (SQLite parsing rule): both have one.
    tx.prepare_cached(&format!(
        "INSERT INTO annotation(user_id, item_type, item_id, play_count, last_played_at)
         SELECT ?1, 'album', album_id, 1, ?3 FROM track WHERE id = ?2 AND album_id IS NOT NULL
         {UPSERT}"
    ))?
    .execute(params![user, track, at])?;
    tx.prepare_cached(&format!(
        "INSERT INTO annotation(user_id, item_type, item_id, play_count, last_played_at)
         SELECT DISTINCT ?1, 'artist', artist_id, 1, ?3 FROM track_artist
          WHERE track_id = ?2 AND role = 'artist'
         {UPSERT}"
    ))?
    .execute(params![user, track, at])?;
    tx.prepare_cached(
        "INSERT INTO scrobble(user_id, track_id, played_at, client) VALUES (?1, ?2, ?3, ?4)",
    )?
    .execute(params![user, track, at, client])?;
    Ok(())
}

/// `scrobble`: `submission=false` says what is playing now, otherwise each `id` (with its
/// `time`, in milliseconds) counts as played.
pub async fn scrobble(ctx: &Ctx) -> Reply {
    let ids: Vec<String> = ctx
        .params
        .all("id")
        .into_iter()
        .filter(|v| !v.is_empty())
        .map(str::to_owned)
        .collect();
    if ids.is_empty() {
        return Err(ApiError::missing("id"));
    }
    let ids = online::resolve_tracks(ctx, ids).await?;
    let times: Vec<Option<i64>> = ctx
        .params
        .all("time")
        .into_iter()
        .map(|t| t.parse::<i64>().ok().map(|ms| ms / 1000))
        .collect();
    let client = ctx.params.get("c").unwrap_or_default().to_owned();
    let user = ctx.user.id.clone();

    if ctx.params.get("submission") == Some("false") {
        let id = ids[0].clone();
        let duration_ms = ctx
            .state
            .db
            .call(move |c| {
                Ok(
                    c.prepare_cached("SELECT duration_ms FROM track WHERE id = ?1")?
                        .query_row([&id], |r| r.get::<_, i64>(0))
                        .optional()?,
                )
            })
            .await?
            .ok_or_else(|| ApiError::not_found("Song"))?;
        ctx.state.now_playing.set(Playing {
            user_id: user,
            username: ctx.user.username.clone(),
            client,
            track_id: ids[0].clone(),
            since: now(),
            duration_ms,
        });
        return Ok(Default::default());
    }

    let missing = ctx
        .state
        .db
        .call(move |c| {
            let tx = c.transaction()?;
            for (i, id) in ids.iter().enumerate() {
                let exists = tx
                    .prepare_cached("SELECT 1 FROM track WHERE id = ?1")?
                    .query_row([id], |_| Ok(()))
                    .optional()?;
                if exists.is_none() {
                    return Ok(Some(id.clone()));
                }
                let at = times.get(i).copied().flatten().unwrap_or_else(now);
                count_play(
                    &tx,
                    &user,
                    id,
                    at,
                    Some(&client).filter(|c| !c.is_empty()).map(|c| c.as_str()),
                )?;
            }
            tx.commit()?;
            Ok(None)
        })
        .await?;
    if let Some(id) = missing {
        return Err(ApiError::new(
            Code::NotFound,
            format!("Song not found: {id}"),
        ));
    }
    Ok(Default::default())
}

// Now playing -----------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct Playing {
    pub user_id: String,
    pub username: String,
    pub client: String,
    pub track_id: String,
    pub since: i64,
    pub duration_ms: i64,
}

impl Playing {
    /// Gone once the song would have ended, with a minute of margin (10 minutes when the
    /// length is unknown).
    fn expired(&self, at: i64) -> bool {
        let length = if self.duration_ms > 0 {
            self.duration_ms / 1000
        } else {
            540
        };
        at > self.since + length + 60
    }
}

/// What each user plays now, one entry per user and client. Kept in memory only.
#[derive(Debug, Default)]
pub struct NowPlaying(Mutex<HashMap<(String, String), Playing>>);

impl NowPlaying {
    pub fn set(&self, p: Playing) {
        if let Ok(mut all) = self.0.lock() {
            all.insert((p.user_id.clone(), p.client.clone()), p);
        }
    }

    /// Current entries, newest first; expired ones are dropped.
    pub fn list(&self) -> Vec<Playing> {
        let Ok(mut all) = self.0.lock() else {
            return Vec::new();
        };
        let at = now();
        all.retain(|_, p| !p.expired(at));
        let mut out: Vec<Playing> = all.values().cloned().collect();
        out.sort_by_key(|p| std::cmp::Reverse(p.since));
        out
    }
}

pub async fn get_now_playing(ctx: &Ctx) -> Reply {
    let playing = ctx.state.now_playing.list();
    let user = ctx.user.id.clone();
    let ids: Vec<String> = playing.iter().map(|p| p.track_id.clone()).collect();
    let songs: HashMap<String, serde_json::Value> = ctx
        .state
        .db
        .call(move |c| {
            let mut out = HashMap::new();
            for id in ids {
                if let Some(s) = model::songs(
                    c,
                    &format!("t.id = ?2 AND {}", model::PLAYABLE),
                    "t.id",
                    &[&user, &id],
                )?
                .into_iter()
                .next()
                {
                    out.insert(id, s);
                }
            }
            Ok(out)
        })
        .await?;
    let at = now();
    let entries: Vec<_> = playing
        .iter()
        .enumerate()
        .filter_map(|(i, p)| {
            let mut s = songs.get(&p.track_id)?.clone();
            s["username"] = json!(p.username);
            s["minutesAgo"] = json!((at - p.since).max(0) / 60);
            s["playerId"] = json!(i + 1);
            s["playerName"] = json!(p.client);
            Some(s)
        })
        .collect();
    Ok(one("nowPlaying", json!({ "entry": entries })))
}
