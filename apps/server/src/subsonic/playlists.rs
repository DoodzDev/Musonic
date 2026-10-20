//! Playlists: reading, creating, editing, deleting.

use std::collections::HashMap;

use serde_json::{Value, json};

use rusqlite::{Connection, OptionalExtension, Transaction, params};

use super::{ApiError, Code, Ctx, Reply, model, one, online};
use crate::{
    events::{Event, PlaylistAction},
    library::import,
};

const PLAYLIST_SELECT: &str = "
SELECT p.id, p.name, p.comment, p.public, p.created_at, p.updated_at, u.username,
       count(t.id) FILTER (WHERE f.visible), coalesce(sum(t.duration_ms) FILTER (WHERE f.visible), 0),
       p.cover_path,
       (SELECT t2.album_id FROM playlist_track pt2 JOIN track t2 ON t2.id = pt2.track_id
         WHERE pt2.playlist_id = p.id ORDER BY pt2.position LIMIT 1)
  FROM playlist p
  JOIN user u ON u.id = p.owner_id
  LEFT JOIN playlist_track pt ON pt.playlist_id = p.id
  LEFT JOIN track t ON t.id = pt.track_id
  LEFT JOIN (SELECT track_id, 1 AS visible FROM track_file WHERE missing = 0
             UNION SELECT track_id, 1 FROM track_source) f
         ON f.track_id = t.id";

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

/// A playlist with its songs, when `user` may see it.
fn load(c: &Connection, id: &str, user: &str) -> rusqlite::Result<Option<Value>> {
    let mut st = c.prepare_cached(&format!(
        "{PLAYLIST_SELECT} WHERE p.id = ?1 AND (p.owner_id = ?2 OR p.public = 1) GROUP BY p.id"
    ))?;
    let Some(mut pl) = st.query_map([id, user], playlist)?.next().transpose()? else {
        return Ok(None);
    };
    // In playlist order, a track listed twice shown twice; a track that cannot be played (no
    // file present, no online source) is left out.
    let order: Vec<String> = c
        .prepare_cached(
            "SELECT track_id FROM playlist_track WHERE playlist_id = ?1 ORDER BY position",
        )?
        .query_map([id], |r| r.get(0))?
        .collect::<rusqlite::Result<_>>()?;
    let songs: HashMap<String, Value> = model::songs(
        c,
        &format!(
            "t.id IN (SELECT track_id FROM playlist_track WHERE playlist_id = ?2) AND {}",
            model::PLAYABLE
        ),
        "t.id",
        &[&user, &id],
    )?
    .into_iter()
    .map(|s| (s["id"].as_str().unwrap_or_default().to_owned(), s))
    .collect();
    pl["entry"] = json!(
        order
            .iter()
            .filter_map(|t| songs.get(t))
            .collect::<Vec<_>>()
    );
    Ok(Some(pl))
}

pub async fn get_playlist(ctx: &Ctx) -> Reply {
    let id = ctx.params.require("id")?.to_owned();
    let user = ctx.user.id.clone();
    let found = ctx.state.db.call(move |c| Ok(load(c, &id, &user)?)).await?;
    found
        .map(|p| one("playlist", p))
        .ok_or_else(|| ApiError::not_found("Playlist"))
}

// Editing ---------------------------------------------------------------------------------
//
// Clients only see the playable tracks (see `load`), so the positions they send count those
// alone. Hidden tracks (file gone, no online source) are kept where they were.

#[derive(Debug, Clone, PartialEq)]
struct Entry {
    track_id: String,
    added_at: i64,
    visible: bool,
}

fn entries(tx: &Transaction, playlist: &str) -> rusqlite::Result<Vec<Entry>> {
    tx.prepare_cached(&format!(
        "SELECT pt.track_id, pt.added_at, {}
           FROM playlist_track pt WHERE pt.playlist_id = ?1 ORDER BY pt.position",
        model::playable("pt.track_id")
    ))?
    .query_map([playlist], |r| {
        Ok(Entry {
            track_id: r.get(0)?,
            added_at: r.get(1)?,
            visible: r.get(2)?,
        })
    })?
    .collect()
}

fn save_entries(tx: &Transaction, playlist: &str, entries: &[Entry]) -> rusqlite::Result<()> {
    tx.prepare_cached("DELETE FROM playlist_track WHERE playlist_id = ?1")?
        .execute([playlist])?;
    let mut ins = tx.prepare_cached(
        "INSERT INTO playlist_track(playlist_id, position, track_id, added_at) VALUES (?1, ?2, ?3, ?4)",
    )?;
    for (pos, e) in entries.iter().enumerate() {
        ins.execute(params![playlist, pos as i64, e.track_id, e.added_at])?;
    }
    tx.prepare_cached("UPDATE playlist SET updated_at = unixepoch() WHERE id = ?1")?
        .execute([playlist])?;
    Ok(())
}

/// The visible list becomes `new` (track ids, with their visibility); each hidden entry stays
/// right after the visible track it followed, or goes to the end when that track is gone.
fn replace_visible(old: &[Entry], new: Vec<(String, bool)>, at: i64) -> Vec<Entry> {
    // Hidden entries, by the visible track before them (None = at the start).
    let mut hidden: Vec<(Option<String>, Entry)> = Vec::new();
    let mut before: Option<String> = None;
    for e in old {
        if e.visible {
            before = Some(e.track_id.clone());
        } else {
            hidden.push((before.clone(), e.clone()));
        }
    }
    let take = |hidden: &mut Vec<(Option<String>, Entry)>, anchor: Option<&str>| {
        let (now, rest): (Vec<_>, Vec<_>) = std::mem::take(hidden)
            .into_iter()
            .partition(|(a, _)| a.as_deref() == anchor);
        *hidden = rest;
        now.into_iter().map(|(_, e)| e)
    };
    let mut out: Vec<Entry> = take(&mut hidden, None).collect();
    let mut placed = std::collections::HashSet::new();
    for (track_id, visible) in new {
        let added_at = old
            .iter()
            .find(|e| e.track_id == track_id)
            .map_or(at, |e| e.added_at);
        let first = placed.insert(track_id.clone());
        out.push(Entry {
            track_id: track_id.clone(),
            added_at,
            visible,
        });
        if first {
            out.extend(take(&mut hidden, Some(&track_id)));
        }
    }
    out.extend(hidden.into_iter().map(|(_, e)| e));
    out
}

/// Removes the visible entries at `indexes` (positions among visible entries; unknown ones
/// are ignored).
fn remove_visible(entries: Vec<Entry>, indexes: &[usize]) -> Vec<Entry> {
    let mut visible = 0;
    entries
        .into_iter()
        .filter(|e| {
            if !e.visible {
                return true;
            }
            let keep = !indexes.contains(&visible);
            visible += 1;
            keep
        })
        .collect()
}

/// Track ids with whether a file is present; `Err` names the first unknown one.
fn songs_to_add(
    tx: &Transaction,
    ids: &[String],
) -> rusqlite::Result<Result<Vec<(String, bool)>, String>> {
    let mut st = tx.prepare_cached(&format!(
        "SELECT {} FROM track t WHERE t.id = ?1",
        model::playable("t.id")
    ))?;
    let mut out = Vec::with_capacity(ids.len());
    for id in ids {
        match st.query_row([id], |r| r.get::<_, bool>(0)).optional()? {
            Some(visible) => out.push((id.clone(), visible)),
            None => return Ok(Err(id.clone())),
        }
    }
    Ok(Ok(out))
}

/// `Ok(false)`: the playlist exists but belongs to someone else.
fn owned(tx: &Transaction, playlist: &str, user: &str) -> rusqlite::Result<Option<bool>> {
    tx.prepare_cached("SELECT owner_id = ?2 FROM playlist WHERE id = ?1")?
        .query_row([playlist, user], |r| r.get(0))
        .optional()
}

enum EditError {
    Missing,
    NotOwner,
    UnknownSong(String),
}

impl From<EditError> for ApiError {
    fn from(e: EditError) -> Self {
        match e {
            EditError::Missing => ApiError::not_found("Playlist"),
            EditError::NotOwner => ApiError::forbidden(),
            EditError::UnknownSong(id) => {
                ApiError::new(Code::NotFound, format!("Song not found: {id}"))
            }
        }
    }
}

fn check_owner(
    tx: &Transaction,
    playlist: &str,
    user: &str,
) -> rusqlite::Result<Result<(), EditError>> {
    Ok(match owned(tx, playlist, user)? {
        None => Err(EditError::Missing),
        Some(false) => Err(EditError::NotOwner),
        Some(true) => Ok(()),
    })
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or_default()
}

fn list(ctx: &Ctx, name: &str) -> Vec<String> {
    ctx.params
        .all(name)
        .into_iter()
        .filter(|v| !v.is_empty())
        .map(str::to_owned)
        .collect()
}

/// `createPlaylist`: a new playlist (`name`), or, with `playlistId`, all its songs replaced
/// (how clients reorder). Answers the playlist.
pub async fn create_playlist(ctx: &Ctx) -> Reply {
    let existing = ctx
        .params
        .get("playlistId")
        .filter(|v| !v.is_empty())
        .map(str::to_owned);
    let name = ctx
        .params
        .get("name")
        .filter(|v| !v.is_empty())
        .map(str::to_owned);
    if existing.is_none() && name.is_none() {
        return Err(ApiError::missing("name"));
    }
    let songs = online::resolve_tracks(ctx, list(ctx, "songId")).await?;
    let import = ctx.state.imports.is_some();
    let action = if existing.is_some() {
        PlaylistAction::Updated
    } else {
        PlaylistAction::Created
    };
    let user = ctx.user.id.clone();
    let result = ctx
        .state
        .db
        .call(move |c| {
            let tx = c.transaction()?;
            let id = match existing {
                Some(id) => {
                    if let Err(e) = check_owner(&tx, &id, &user)? {
                        return Ok(Err(e));
                    }
                    if let Some(name) = &name {
                        tx.prepare_cached("UPDATE playlist SET name = ?2 WHERE id = ?1")?
                            .execute([&id, name])?;
                    }
                    id
                }
                None => {
                    let id = crate::ids::new_id();
                    tx.prepare_cached(
                        "INSERT INTO playlist(id, owner_id, name) VALUES (?1, ?2, ?3)",
                    )?
                    .execute(params![id, user, name])?;
                    id
                }
            };
            let new = match songs_to_add(&tx, &songs)? {
                Ok(new) => new,
                Err(song) => return Ok(Err(EditError::UnknownSong(song))),
            };
            queue_imports(&tx, import, &new, &user)?;
            let entries = replace_visible(&entries(&tx, &id)?, new, now());
            save_entries(&tx, &id, &entries)?;
            let pl = load(&tx, &id, &user)?;
            tx.commit()?;
            Ok(Ok(pl))
        })
        .await?;
    let pl = result?.ok_or_else(|| ApiError::not_found("Playlist"))?;
    wake_imports(ctx);
    ctx.emit(Event::Playlist {
        id: pl["id"].as_str().unwrap_or_default().to_owned(),
        action,
    });
    Ok(one("playlist", pl))
}

/// `updatePlaylist`: name, comment, public flag, songs removed (`songIndexToRemove`, applied
/// first) and added at the end (`songIdToAdd`).
pub async fn update_playlist(ctx: &Ctx) -> Reply {
    let id = ctx.params.require("playlistId")?.to_owned();
    let name = ctx.params.get("name").map(str::to_owned);
    let comment = ctx.params.get("comment").map(str::to_owned);
    let public = ctx.params.get("public").map(|v| v == "true");
    // A user without the right keeps their playlists private.
    let public = match public {
        Some(true) if !ctx.limits().await.can_public_playlists => Some(false),
        p => p,
    };
    let add = online::resolve_tracks(ctx, list(ctx, "songIdToAdd")).await?;
    let import = ctx.state.imports.is_some();
    let changed = id.clone();
    let remove: Vec<usize> = ctx
        .params
        .all("songIndexToRemove")
        .into_iter()
        .filter_map(|v| v.parse().ok())
        .collect();
    let user = ctx.user.id.clone();
    let result = ctx
        .state
        .db
        .call(move |c| {
            let tx = c.transaction()?;
            if let Err(e) = check_owner(&tx, &id, &user)? {
                return Ok(Err(e));
            }
            let new = match songs_to_add(&tx, &add)? {
                Ok(new) => new,
                Err(song) => return Ok(Err(EditError::UnknownSong(song))),
            };
            queue_imports(&tx, import, &new, &user)?;
            if let Some(name) = name.filter(|n| !n.is_empty()) {
                tx.prepare_cached("UPDATE playlist SET name = ?2 WHERE id = ?1")?
                    .execute([&id, &name])?;
            }
            if let Some(comment) = comment {
                tx.prepare_cached("UPDATE playlist SET comment = ?2 WHERE id = ?1")?
                    .execute([&id, &comment])?;
            }
            if let Some(public) = public {
                tx.prepare_cached("UPDATE playlist SET public = ?2 WHERE id = ?1")?
                    .execute(params![id, public])?;
            }
            let at = now();
            let mut list = remove_visible(entries(&tx, &id)?, &remove);
            list.extend(new.into_iter().map(|(track_id, visible)| Entry {
                track_id,
                added_at: at,
                visible,
            }));
            save_entries(&tx, &id, &list)?;
            tx.commit()?;
            Ok(Ok(()))
        })
        .await?;
    result?;
    wake_imports(ctx);
    ctx.emit(Event::Playlist {
        id: changed,
        action: PlaylistAction::Updated,
    });
    Ok(Default::default())
}

/// Songs put in a playlist are imported when they have no file (see `library::import`).
fn queue_imports(
    tx: &Transaction,
    enabled: bool,
    songs: &[(String, bool)],
    user: &str,
) -> rusqlite::Result<()> {
    if enabled {
        for (track, _) in songs {
            import::queue(tx, track, Some(user))?;
        }
    }
    Ok(())
}

fn wake_imports(ctx: &Ctx) {
    if let Some(imports) = &ctx.state.imports {
        imports.wake();
    }
}

pub async fn delete_playlist(ctx: &Ctx) -> Reply {
    let id = ctx.params.require("id")?.to_owned();
    let deleted = id.clone();
    let user = ctx.user.id.clone();
    let result = ctx
        .state
        .db
        .call(move |c| {
            let tx = c.transaction()?;
            if let Err(e) = check_owner(&tx, &id, &user)? {
                return Ok(Err(e));
            }
            tx.prepare_cached("DELETE FROM playlist WHERE id = ?1")?
                .execute([&id])?;
            tx.commit()?;
            Ok(Ok(()))
        })
        .await?;
    result?;
    ctx.emit(Event::Playlist {
        id: deleted,
        action: PlaylistAction::Deleted,
    });
    Ok(Default::default())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn e(id: &str, visible: bool) -> Entry {
        Entry {
            track_id: id.into(),
            added_at: 1,
            visible,
        }
    }

    fn ids(list: &[Entry]) -> Vec<&str> {
        list.iter().map(|e| e.track_id.as_str()).collect()
    }

    #[test]
    fn removing_counts_visible_entries_only() {
        // Seen by the client: a, c, d (b and x have no file).
        let list = vec![
            e("a", true),
            e("b", false),
            e("c", true),
            e("x", false),
            e("d", true),
        ];
        assert_eq!(
            ids(&remove_visible(list.clone(), &[1])),
            ["a", "b", "x", "d"]
        );
        assert_eq!(ids(&remove_visible(list, &[0, 2, 9])), ["b", "c", "x"]);
    }

    #[test]
    fn reordering_keeps_hidden_entries_after_their_track() {
        let old = vec![
            e("h0", false),
            e("a", true),
            e("b", false),
            e("c", true),
            e("x", false),
        ];
        let new = vec![("c".into(), true), ("a".into(), true), ("n".into(), true)];
        let out = replace_visible(&old, new, 9);
        assert_eq!(ids(&out), ["h0", "c", "x", "a", "b", "n"]);
        assert_eq!(out[1].added_at, 1, "an entry kept keeps its date");
        assert_eq!(out[5].added_at, 9);
        // Its visible track removed: the hidden one goes to the end.
        let out = replace_visible(&old, vec![("c".into(), true)], 9);
        assert_eq!(ids(&out), ["h0", "c", "x", "b"]);
    }
}
