//! Playlists. Reading here; creating and editing come with the next lot.

use std::collections::HashMap;

use serde_json::{Value, json};

use super::{ApiError, Ctx, Reply, model, one};

const PLAYLIST_SELECT: &str = "
SELECT p.id, p.name, p.comment, p.public, p.created_at, p.updated_at, u.username,
       count(pt.track_id), coalesce(sum(t.duration_ms), 0), p.cover_path,
       (SELECT t2.album_id FROM playlist_track pt2 JOIN track t2 ON t2.id = pt2.track_id
         WHERE pt2.playlist_id = p.id ORDER BY pt2.position LIMIT 1)
  FROM playlist p
  JOIN user u ON u.id = p.owner_id
  LEFT JOIN playlist_track pt ON pt.playlist_id = p.id
  LEFT JOIN track t ON t.id = pt.track_id";

fn playlist(r: &rusqlite::Row) -> rusqlite::Result<Value> {
    let id: String = r.get(0)?;
    let first_album: Option<String> = r.get(10)?;
    Ok(json!({
        "id": id,
        "name": r.get::<_, String>(1)?,
        "comment": r.get::<_, String>(2)?,
        "public": r.get::<_, i64>(3)? != 0,
        "created": model::iso(r.get(4)?),
        "changed": model::iso(r.get(5)?),
        "owner": r.get::<_, String>(6)?,
        "songCount": r.get::<_, i64>(7)?,
        "duration": (r.get::<_, i64>(8)? + 500) / 1000,
        "coverArt": if r.get::<_, Option<String>>(9)?.is_some() { Some(format!("pl-{id}")) } else { first_album },
    }))
}

pub async fn get_playlists(ctx: &Ctx) -> Reply {
    let user = ctx.user.id.clone();
    let rows = ctx
        .state
        .db
        .call(move |c| {
            let mut st = c.prepare_cached(&format!(
                "{PLAYLIST_SELECT} WHERE p.owner_id = ?1 OR p.public = 1 GROUP BY p.id ORDER BY p.name COLLATE NOCASE"
            ))?;
            Ok(st.query_map([&user], playlist)?.collect::<rusqlite::Result<Vec<_>>>()?)
        })
        .await?;
    Ok(one("playlists", json!({ "playlist": rows })))
}

pub async fn get_playlist(ctx: &Ctx) -> Reply {
    let id = ctx.params.require("id")?.to_owned();
    let user = ctx.user.id.clone();
    let found = ctx
        .state
        .db
        .call(move |c| {
            let mut st = c.prepare_cached(&format!(
                "{PLAYLIST_SELECT} WHERE p.id = ?1 AND (p.owner_id = ?2 OR p.public = 1) GROUP BY p.id"
            ))?;
            let Some(mut pl) = st.query_map([&id, &user], playlist)?.next().transpose()? else {
                return Ok(None);
            };
            // In playlist order, a track listed twice shown twice; a track without a file
            // present is left out.
            let order: Vec<String> = c
                .prepare_cached("SELECT track_id FROM playlist_track WHERE playlist_id = ?1 ORDER BY position")?
                .query_map([&id], |r| r.get(0))?
                .collect::<rusqlite::Result<_>>()?;
            let songs: HashMap<String, Value> = model::songs(
                c,
                "t.id IN (SELECT track_id FROM playlist_track WHERE playlist_id = ?2)",
                "t.id",
                &[&user, &id],
            )?
            .into_iter()
            .map(|s| (s["id"].as_str().unwrap_or_default().to_owned(), s))
            .collect();
            pl["entry"] = json!(order.iter().filter_map(|t| songs.get(t)).collect::<Vec<_>>());
            Ok(Some(pl))
        })
        .await?;
    found
        .map(|p| one("playlist", p))
        .ok_or_else(|| ApiError::not_found("Playlist"))
}
