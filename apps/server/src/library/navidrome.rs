//! Import from Navidrome (`musonic-server import-navidrome <copy of navidrome.db>`): playlists,
//! likes, ratings, play counts and plays of the accounts that exist here (same user name).
//! Passwords are never read.
//!
//! Tracks are matched by their path in the music folder (the same folder: both store paths
//! relative to it), then ignoring case and accents. By default a matched track takes the id it
//! had in Navidrome, and playlists keep theirs, so what clients saved (downloads, caches) keeps
//! working. Albums and artists get the ids computed here from the tags.
//!
//! Run it again: playlists already imported are left as they are (or replaced on request), likes
//! keep their first date, counts keep the highest, plays are not added twice.

use std::collections::{HashMap, HashSet};

use anyhow::{Context, Result, bail};
use rusqlite::{Connection, OptionalExtension, Transaction, params};
use serde::Serialize;
use unicode_normalization::UnicodeNormalization;

use crate::ids;

#[derive(Debug, Default, Serialize)]
pub struct NavidromeReport {
    /// Accounts imported, and the Navidrome accounts left out (no account of that name here).
    pub users: Vec<String>,
    pub users_skipped: Vec<String>,
    /// Navidrome files found in the library, and not found.
    pub files_matched: usize,
    pub files_not_found: usize,
    /// Tracks that took their Navidrome id.
    pub ids_kept: usize,
    pub playlists: usize,
    pub playlists_already_there: usize,
    pub playlist_entries: usize,
    /// Playlist entries whose file is not in the library.
    pub playlist_entries_missing: usize,
    pub track_annotations: usize,
    pub album_annotations: usize,
    pub artist_annotations: usize,
    pub plays: usize,
}

#[derive(Debug, Clone, Copy)]
pub struct NavidromeOptions {
    /// Give tracks and playlists their Navidrome ids.
    pub keep_ids: bool,
    /// Replace playlists imported before.
    pub replace_playlists: bool,
}

impl Default for NavidromeOptions {
    fn default() -> Self {
        Self {
            keep_ids: true,
            replace_playlists: false,
        }
    }
}

/// Seconds of a Navidrome date (`2026-05-20 13:22:06.682938858+00:00`, UTC).
const ND_DATE: &str = "unixepoch(substr({}, 1, 19))";

fn nd_date(col: &str) -> String {
    ND_DATE.replace("{}", col)
}

/// Same path, ignoring case and accents (different Unicode forms of the same name).
fn loose(path: &str) -> String {
    path.nfkd()
        .filter(|c| !unicode_normalization::char::is_combining_mark(*c))
        .collect::<String>()
        .to_lowercase()
}

/// Imports from the Navidrome database at `path` (opened read-only) into `c`.
pub fn import(
    c: &mut Connection,
    path: &std::path::Path,
    opts: NavidromeOptions,
) -> Result<NavidromeReport> {
    if !path.is_file() {
        bail!("{} not found", path.display());
    }
    let uri = format!("file:{}?mode=ro", path.display());
    c.execute("ATTACH DATABASE ?1 AS nd", [&uri])
        .context("opening the Navidrome database")?;
    let result = (|| {
        let tx = c.transaction()?;
        // Renaming tracks below: foreign keys are checked once, at the end.
        tx.pragma_update(None, "defer_foreign_keys", true)?;
        let report = import_in(&tx, opts)?;
        tx.commit()?;
        Ok(report)
    })();
    let _ = c.execute("DETACH DATABASE nd", []);
    result
}

fn import_in(tx: &Transaction, opts: NavidromeOptions) -> Result<NavidromeReport> {
    let mut report = NavidromeReport::default();
    let version: Option<String> = tx
        .query_row(
            "SELECT name FROM nd.sqlite_master WHERE type = 'table' AND name = 'media_file'",
            [],
            |r| r.get(0),
        )
        .optional()?;
    if version.is_none() {
        bail!("not a Navidrome database (no media_file table)");
    }

    // Accounts, by user name.
    let users: Vec<(String, String, Option<String>)> = tx
        .prepare(
            "SELECT n.id, n.user_name, u.id FROM nd.user n
               LEFT JOIN user u ON u.username = n.user_name COLLATE NOCASE ORDER BY n.user_name",
        )?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
        .collect::<rusqlite::Result<_>>()?;
    tx.execute_batch("CREATE TEMP TABLE nd_user(nd_id TEXT PRIMARY KEY, user_id TEXT NOT NULL)")?;
    for (nd, name, ours) in users {
        match ours {
            Some(id) => {
                tx.execute("INSERT INTO nd_user VALUES (?1, ?2)", params![nd, id])?;
                report.users.push(name);
            }
            None => report.users_skipped.push(name),
        }
    }

    // Files → tracks, by path, then loosely.
    tx.execute_batch(
        "CREATE TEMP TABLE nd_track(nd_id TEXT PRIMARY KEY, track_id TEXT NOT NULL);
         INSERT OR IGNORE INTO nd_track
         SELECT m.id, f.track_id FROM nd.media_file m JOIN track_file f ON f.path = m.path;",
    )?;
    let unmatched: Vec<(String, String)> = tx
        .prepare("SELECT id, path FROM nd.media_file WHERE id NOT IN (SELECT nd_id FROM nd_track)")?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<rusqlite::Result<_>>()?;
    if !unmatched.is_empty() {
        let ours: HashMap<String, String> = tx
            .prepare("SELECT path, track_id FROM track_file")?
            .query_map([], |r| Ok((loose(&r.get::<_, String>(0)?), r.get(1)?)))?
            .collect::<rusqlite::Result<_>>()?;
        for (nd, p) in &unmatched {
            if let Some(track) = ours.get(&loose(p)) {
                tx.execute("INSERT INTO nd_track VALUES (?1, ?2)", params![nd, track])?;
            }
        }
    }
    report.files_matched = tx.query_row("SELECT count(*) FROM nd_track", [], |r| r.get(0))?;
    let files: usize = tx.query_row("SELECT count(*) FROM nd.media_file", [], |r| r.get(0))?;
    report.files_not_found = files - report.files_matched;

    if opts.keep_ids {
        report.ids_kept = keep_track_ids(tx)?;
    }
    playlists(tx, opts, &mut report)?;
    annotations(tx, &mut report)?;
    report.plays = tx.execute(
        "INSERT INTO scrobble(user_id, track_id, played_at, client)
         SELECT u.user_id, t.track_id, s.submission_time, 'navidrome'
           FROM nd.scrobbles s
           JOIN nd_user u ON u.nd_id = s.user_id
           JOIN nd_track t ON t.nd_id = s.media_file_id
          WHERE NOT EXISTS (SELECT 1 FROM scrobble x WHERE x.user_id = u.user_id
                               AND x.track_id = t.track_id AND x.played_at = s.submission_time)",
        [],
    )?;
    tx.execute_batch("DROP TABLE nd_user; DROP TABLE nd_track;")?;
    Ok(report)
}

/// Gives each matched track one of its Navidrome ids (a track with two files had two).
fn keep_track_ids(tx: &Transaction) -> Result<usize> {
    let pairs: Vec<(String, String)> = tx
        .prepare(
            "SELECT track_id, min(nd_id) FROM nd_track
              WHERE track_id NOT IN (SELECT nd_id FROM nd_track)
              GROUP BY track_id",
        )?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<rusqlite::Result<_>>()?;
    let mut kept = 0;
    for (old, new) in pairs {
        let taken: bool = tx.query_row(
            "SELECT EXISTS (SELECT 1 FROM track WHERE id = ?1)",
            [&new],
            |r| r.get(0),
        )?;
        if taken {
            continue;
        }
        tx.execute("UPDATE track SET id = ?2 WHERE id = ?1", params![old, new])?;
        for table in [
            "track_file",
            "track_source",
            "track_artist",
            "track_genre",
            "scrobble",
            "playlist_track",
            "play_queue_item",
            "lyrics",
            "import_job",
            "nd_track",
        ] {
            tx.execute(
                &format!("UPDATE {table} SET track_id = ?2 WHERE track_id = ?1"),
                params![old, new],
            )?;
        }
        tx.execute(
            "UPDATE annotation SET item_id = ?2 WHERE item_type = 'track' AND item_id = ?1",
            params![old, new],
        )?;
        kept += 1;
    }
    Ok(kept)
}

fn playlists(tx: &Transaction, opts: NavidromeOptions, report: &mut NavidromeReport) -> Result<()> {
    let lists: Vec<(String, String, String, String, bool, i64, i64)> = tx
        .prepare(&format!(
            "SELECT p.id, u.user_id, p.name, coalesce(p.comment, ''), p.public, {}, {}
               FROM nd.playlist p JOIN nd_user u ON u.nd_id = p.owner_id ORDER BY p.name",
            nd_date("p.created_at"),
            nd_date("p.updated_at")
        ))?
        .query_map([], |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get(4)?,
                r.get::<_, Option<i64>>(5)?.unwrap_or_default(),
                r.get::<_, Option<i64>>(6)?.unwrap_or_default(),
            ))
        })?
        .collect::<rusqlite::Result<_>>()?;
    for (nd, owner, name, comment, public, created, updated) in lists {
        let id = if opts.keep_ids {
            nd.clone()
        } else {
            ids::new_playlist_id()
        };
        // Imported before: by id, or (new ids) by owner and name.
        let existing: Option<String> = tx
            .query_row(
                "SELECT id FROM playlist WHERE id = ?1 OR (?2 AND owner_id = ?3 AND name = ?4)",
                params![id, !opts.keep_ids, owner, name],
                |r| r.get(0),
            )
            .optional()?;
        if let Some(old) = existing {
            if !opts.replace_playlists {
                report.playlists_already_there += 1;
                continue;
            }
            tx.execute("DELETE FROM playlist WHERE id = ?1", [&old])?;
        }
        tx.execute(
            "INSERT INTO playlist(id, owner_id, name, comment, public, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, owner, name, comment, public, created, updated],
        )?;
        let entries: Vec<Option<String>> = tx
            .prepare(
                "SELECT t.track_id FROM nd.playlist_tracks pt
                   LEFT JOIN nd_track t ON t.nd_id = pt.media_file_id
                  WHERE pt.playlist_id = ?1 ORDER BY pt.id",
            )?
            .query_map([&nd], |r| r.get(0))?
            .collect::<rusqlite::Result<_>>()?;
        let mut pos = 0i64;
        for track in entries {
            match track {
                Some(t) => {
                    tx.execute(
                        "INSERT INTO playlist_track(playlist_id, position, track_id, added_at) VALUES (?1, ?2, ?3, ?4)",
                        params![id, pos, t, created],
                    )?;
                    pos += 1;
                    report.playlist_entries += 1;
                }
                None => report.playlist_entries_missing += 1,
            }
        }
        report.playlists += 1;
    }
    Ok(())
}

/// Likes keep their first date, ratings the one set here if any, counts and dates the highest.
const MERGE: &str = "ON CONFLICT(user_id, item_type, item_id) DO UPDATE SET
    starred_at = coalesce(annotation.starred_at, excluded.starred_at),
    rating = CASE WHEN annotation.rating > 0 THEN annotation.rating ELSE excluded.rating END,
    play_count = max(annotation.play_count, excluded.play_count),
    last_played_at = nullif(max(coalesce(annotation.last_played_at, 0), coalesce(excluded.last_played_at, 0)), 0)";

/// User, artist name, liked at, rating, play count, last played at.
type ArtistNote = (String, String, Option<i64>, i64, i64, Option<i64>);

fn annotations(tx: &Transaction, report: &mut NavidromeReport) -> Result<()> {
    let starred = format!(
        "min(CASE WHEN a.starred THEN {} END)",
        nd_date("a.starred_at")
    );
    let played = format!("max({})", nd_date("a.play_date"));
    // Tracks: a track with two files in Navidrome had two annotations, merged.
    report.track_annotations = tx.execute(
        &format!(
            "INSERT INTO annotation(user_id, item_type, item_id, starred_at, rating, play_count, last_played_at)
             SELECT u.user_id, 'track', t.track_id, {starred}, coalesce(max(a.rating), 0),
                    coalesce(sum(a.play_count), 0), {played}
               FROM nd.annotation a
               JOIN nd_user u ON u.nd_id = a.user_id
               JOIN nd_track t ON t.nd_id = a.item_id
              WHERE a.item_type = 'media_file'
              GROUP BY u.user_id, t.track_id
             {MERGE}"
        ),
        [],
    )?;
    // Albums: the album here of their files.
    report.album_annotations = tx.execute(
        &format!(
            "INSERT INTO annotation(user_id, item_type, item_id, starred_at, rating, play_count, last_played_at)
             SELECT u.user_id, 'album', al.album_id, {starred}, coalesce(max(a.rating), 0),
                    coalesce(max(a.play_count), 0), {played}
               FROM nd.annotation a
               JOIN nd_user u ON u.nd_id = a.user_id
               JOIN (SELECT DISTINCT m.album_id AS nd_album, tr.album_id
                       FROM nd.media_file m JOIN nd_track t ON t.nd_id = m.id
                       JOIN track tr ON tr.id = t.track_id WHERE tr.album_id IS NOT NULL) al
                 ON al.nd_album = a.item_id
              WHERE a.item_type = 'album'
              GROUP BY u.user_id, al.album_id
             {MERGE}"
        ),
        [],
    )?;
    // Artists: same name.
    let rows: Vec<ArtistNote> = tx
        .prepare(&format!(
            "SELECT u.user_id, ar.name, CASE WHEN a.starred THEN {} END, coalesce(a.rating, 0),
                    coalesce(a.play_count, 0), {}
               FROM nd.annotation a
               JOIN nd_user u ON u.nd_id = a.user_id
               JOIN nd.artist ar ON ar.id = a.item_id
              WHERE a.item_type = 'artist'",
            nd_date("a.starred_at"),
            nd_date("a.play_date")
        ))?
        .query_map([], |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get(4)?,
                r.get(5)?,
            ))
        })?
        .collect::<rusqlite::Result<_>>()?;
    let mut done = HashSet::new();
    for (user, name, starred, rating, plays, played) in rows {
        let id = ids::artist_id(&name);
        let exists: bool = tx.query_row(
            "SELECT EXISTS (SELECT 1 FROM artist WHERE id = ?1)",
            [&id],
            |r| r.get(0),
        )?;
        if !exists || !done.insert((user.clone(), id.clone())) {
            continue;
        }
        tx.execute(
            &format!(
                "INSERT INTO annotation(user_id, item_type, item_id, starred_at, rating, play_count, last_played_at)
                 VALUES (?1, 'artist', ?2, ?3, ?4, ?5, ?6) {MERGE}"
            ),
            params![user, id, starred, rating, plays, played],
        )?;
        report.artist_annotations += 1;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loose_paths_ignore_case_and_accents() {
        assert_eq!(
            loose("Sigur Rós/Takk/Hoppípolla.mp3"),
            loose("sigur ro\u{301}s/takk/hoppi\u{301}polla.MP3")
        );
    }
}
