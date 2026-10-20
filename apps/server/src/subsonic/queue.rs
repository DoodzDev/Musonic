//! Saved play queue, to resume on another device (`savePlayQueue`, `getPlayQueue` and the
//! OpenSubsonic `…ByIndex` variants).

use std::collections::HashMap;

use rusqlite::{OptionalExtension, params};
use serde_json::{Value, json};

use super::{Ctx, Reply, model, one, online};

/// Saves the queue; no `id` clears it. Unknown tracks are left out.
pub async fn save(ctx: &Ctx, by_index: bool) -> Reply {
    let ids: Vec<String> = ctx
        .params
        .all("id")
        .into_iter()
        .filter(|v| !v.is_empty())
        .map(str::to_owned)
        .collect();
    let current_index: Option<usize> = if by_index {
        ctx.params.get("currentIndex").and_then(|v| v.parse().ok())
    } else {
        let current = ctx.params.get("current");
        current.and_then(|c| ids.iter().position(|id| id == c))
    };
    // Online songs of the queue are stored (it is a use, like a play).
    let ids = online::resolve_tracks(ctx, ids).await?;
    let position_ms: i64 = ctx
        .params
        .get("position")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0)
        .max(0);
    let client = ctx.params.get("c").map(str::to_owned);
    let user = ctx.user.id.clone();
    ctx.state
        .db
        .call(move |c| {
            let tx = c.transaction()?;
            tx.prepare_cached("DELETE FROM play_queue WHERE user_id = ?1")?
                .execute([&user])?;
            if !ids.is_empty() {
                let mut known = Vec::with_capacity(ids.len());
                // The current entry, or the next known one when it is unknown.
                let mut current = None;
                {
                    let mut st = tx.prepare_cached("SELECT 1 FROM track WHERE id = ?1")?;
                    for (i, id) in ids.iter().enumerate() {
                        if st.query_row([id], |_| Ok(())).optional()?.is_some() {
                            if current.is_none() && current_index.is_some_and(|c| i >= c) {
                                current = Some(known.len());
                            }
                            known.push(id);
                        }
                    }
                }
                tx.prepare_cached(
                    "INSERT INTO play_queue(user_id, current, position_ms, changed_by, updated_at)
                     VALUES (?1, ?2, ?3, ?4, unixepoch())",
                )?
                .execute(params![
                    user,
                    current.unwrap_or(0) as i64,
                    position_ms,
                    client
                ])?;
                let mut ins = tx.prepare_cached(
                    "INSERT INTO play_queue_item(user_id, position, track_id) VALUES (?1, ?2, ?3)",
                )?;
                for (pos, id) in known.iter().enumerate() {
                    ins.execute(params![user, pos as i64, id])?;
                }
            }
            tx.commit()?;
            Ok(())
        })
        .await?;
    Ok(Default::default())
}

/// The saved queue; nothing when none is saved. Tracks without a file present are left out,
/// the current one then moves to the next shown.
pub async fn get(ctx: &Ctx, by_index: bool) -> Reply {
    let user = ctx.user.id.clone();
    let username = ctx.user.username.clone();
    let found = ctx
        .state
        .db
        .call(move |c| {
            let Some((current, position_ms, changed_by, updated_at)) = c
                .prepare_cached(
                    "SELECT current, position_ms, changed_by, updated_at FROM play_queue WHERE user_id = ?1",
                )?
                .query_row([&user], |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, i64>(1)?,
                        r.get::<_, Option<String>>(2)?,
                        r.get::<_, i64>(3)?,
                    ))
                })
                .optional()?
            else {
                return Ok(None);
            };
            let order: Vec<String> = c
                .prepare_cached("SELECT track_id FROM play_queue_item WHERE user_id = ?1 ORDER BY position")?
                .query_map([&user], |r| r.get(0))?
                .collect::<rusqlite::Result<_>>()?;
            let songs: HashMap<String, Value> = model::songs(
                c,
                &format!(
                    "t.id IN (SELECT track_id FROM play_queue_item WHERE user_id = ?1) AND {}",
                    model::PLAYABLE
                ),
                "t.id",
                &[&user],
            )?
            .into_iter()
            .map(|s| (s["id"].as_str().unwrap_or_default().to_owned(), s))
            .collect();
            let mut entries = Vec::new();
            let mut shown_current = None;
            for (i, id) in order.iter().enumerate() {
                if let Some(s) = songs.get(id) {
                    if shown_current.is_none() && i as i64 >= current {
                        shown_current = Some(entries.len());
                    }
                    entries.push(s.clone());
                }
            }
            Ok(Some((entries, shown_current, position_ms, changed_by, updated_at)))
        })
        .await?;
    let Some((entries, current, position_ms, changed_by, updated_at)) = found else {
        return Ok(Default::default());
    };
    let mut queue = json!({
        "position": position_ms,
        "username": username,
        "changed": model::iso(updated_at),
        "changedBy": changed_by.unwrap_or_default(),
    });
    if let Some(i) = current {
        if by_index {
            queue["currentIndex"] = json!(i);
        } else {
            queue["current"] = entries[i]["id"].clone();
        }
    }
    queue["entry"] = json!(entries);
    Ok(one("playQueue", queue))
}
