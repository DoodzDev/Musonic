//! Online tracks stored in the library (without a file), and what is already known.
//!
//! A stored track gets the album id and persistent id the scanner computes from the same tags,
//! so its imported file is attached to it (see `library::scanner`).

use anyhow::Result;
use rusqlite::{Connection, OptionalExtension, Transaction, params};

use super::{DEEZER, deezer::DzTrack};
use crate::{
    ids,
    library::scanner::upsert_artist,
    matcher::{normalize, normalize_artists},
};

fn known(c: &Connection, table: &str, column: &str, id: u64) -> rusqlite::Result<Option<String>> {
    c.prepare_cached(&format!(
        "SELECT {column} FROM {table} WHERE provider = ?1 AND provider_id = ?2"
    ))?
    .query_row(params![DEEZER, id.to_string()], |r| r.get(0))
    .optional()
}

/// Canonical id of a Deezer track already stored or linked.
pub fn known_track(c: &Connection, id: u64) -> rusqlite::Result<Option<String>> {
    known(c, "track_source", "track_id", id)
}

pub fn known_album(c: &Connection, id: u64) -> rusqlite::Result<Option<String>> {
    known(c, "album_source", "album_id", id)
}

pub fn known_artist(c: &Connection, id: u64) -> rusqlite::Result<Option<String>> {
    known(c, "artist_source", "artist_id", id)
}

/// The Deezer album / artist id behind a canonical one, when it came from Deezer.
pub fn source_of(
    c: &Connection,
    table: &str,
    column: &str,
    id: &str,
) -> rusqlite::Result<Option<u64>> {
    let found: Option<String> = c
        .prepare_cached(&format!(
            "SELECT provider_id FROM {table} WHERE provider = ?1 AND {column} = ?2 LIMIT 1"
        ))?
        .query_row(params![DEEZER, id], |r| r.get(0))
        .optional()?;
    Ok(found.and_then(|v| v.parse().ok()))
}

/// What the scanner would read from the tags of this track's file.
pub struct Tags {
    pub title: String,
    pub artists: Vec<String>,
    pub album: String,
    pub album_artist: String,
    pub disc: Option<i64>,
    pub track: Option<i64>,
    pub duration_ms: i64,
    pub isrc: Option<String>,
    pub year: Option<i64>,
    pub release_date: Option<String>,
}

impl Tags {
    pub fn of(t: &DzTrack) -> Self {
        let artists: Vec<String> = t.artists().iter().map(|a| a.name.clone()).collect();
        let album = t.album.as_ref();
        let release_date = t
            .release_date
            .clone()
            .or_else(|| album.and_then(|a| a.release_date.clone()))
            .filter(|d| !d.is_empty() && !d.starts_with("0000"));
        Self {
            title: t.title.clone(),
            album: album
                .map(|a| a.title.clone())
                .filter(|a| !a.is_empty())
                .unwrap_or_else(|| crate::library::scanner::UNKNOWN_ALBUM.to_owned()),
            // Deezer albums belong to their main artist.
            album_artist: album
                .and_then(|a| a.artist.as_ref())
                .map(|a| a.name.clone())
                .or_else(|| artists.first().cloned())
                .unwrap_or_else(|| "Unknown Artist".to_owned()),
            artists: if artists.is_empty() {
                vec!["Unknown Artist".to_owned()]
            } else {
                artists
            },
            disc: t.disk_number,
            track: t.track_position,
            duration_ms: t.duration * 1000,
            isrc: t.isrc.clone().filter(|i| !i.is_empty()),
            year: release_date
                .as_deref()
                .and_then(|d| d.get(..4)?.parse().ok()),
            release_date,
        }
    }
}

/// A library track that is the same recording: same ISRC, or same title, artists and length.
fn same_recording(
    tx: &Transaction,
    tags: &Tags,
    norm_artists: &str,
) -> rusqlite::Result<Option<String>> {
    if let Some(isrc) = &tags.isrc {
        let hit = tx
            .prepare_cached("SELECT id FROM track WHERE isrc = ?1 LIMIT 1")?
            .query_row([isrc], |r| r.get(0))
            .optional()?;
        if hit.is_some() {
            return Ok(hit);
        }
    }
    tx.prepare_cached(
        "SELECT id FROM track WHERE norm_title = ?1 AND norm_artists = ?2
          AND abs(duration_ms - ?3) <= 3000 LIMIT 1",
    )?
    .query_row(
        params![normalize(&tags.title), norm_artists, tags.duration_ms],
        |r| r.get(0),
    )
    .optional()
}

/// Canonical id of an online track: the one known for it, the library track it matches (then
/// linked to it), or a new track without a file.
pub fn store_track(tx: &Transaction, t: &DzTrack) -> Result<String> {
    if let Some(id) = known_track(tx, t.id)? {
        return Ok(id);
    }
    let tags = Tags::of(t);
    let norm_artists = normalize_artists(tags.artists.iter().map(String::as_str)).join("|");
    let link = |track: &str| -> Result<()> {
        tx.prepare_cached(
            "INSERT OR IGNORE INTO track_source(provider, provider_id, track_id) VALUES (?1, ?2, ?3)",
        )?
        .execute(params![DEEZER, t.id.to_string(), track])?;
        Ok(())
    };
    if let Some(id) = same_recording(tx, &tags, &norm_artists)? {
        link(&id)?;
        return Ok(id);
    }

    // Album, as the scanner names it.
    let album_pid = ids::album_pid(None, &tags.album_artist, &tags.album);
    let album_id = ids::album_id(&album_pid);
    let dz_album = t.album.as_ref();
    tx.execute(
        "INSERT INTO album(id, title, norm_title, artist_display, year, release_date, cover_url, pid)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(id) DO UPDATE SET cover_url = coalesce(album.cover_url, excluded.cover_url)",
        params![
            album_id,
            tags.album,
            normalize(&tags.album),
            tags.album_artist,
            tags.year,
            tags.release_date,
            dz_album.and_then(|a| a.cover_xl.clone()),
            album_pid
        ],
    )?;
    let album_artist = upsert_artist(tx, &tags.album_artist)?;
    tx.execute(
        "INSERT OR IGNORE INTO album_artist(album_id, artist_id, role, position) VALUES (?1, ?2, 'albumartist', 0)",
        params![album_id, album_artist],
    )?;
    if let Some(a) = dz_album.filter(|a| a.id > 0) {
        tx.execute(
            "INSERT OR IGNORE INTO album_source(provider, provider_id, album_id) VALUES (?1, ?2, ?3)",
            params![DEEZER, a.id.to_string(), album_id],
        )?;
    }

    // Track.
    let pid = ids::track_pid(
        None,
        &album_pid,
        tags.disc.map(|d| d as u32),
        tags.track.map(|n| n as u32),
        &tags.title,
    );
    let id = ids::new_track_id();
    tx.execute(
        "INSERT INTO track(id, title, norm_title, norm_artists, artist_display, album_id, disc_number,
             track_number, duration_ms, isrc, pid, year, release_date, explicit, bpm, cover_url)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
        params![
            id,
            tags.title,
            normalize(&tags.title),
            norm_artists,
            tags.artists.join(" • "),
            album_id,
            tags.disc,
            tags.track,
            tags.duration_ms,
            tags.isrc,
            pid,
            tags.year,
            tags.release_date,
            t.explicit_lyrics,
            t.bpm.filter(|b| *b > 0.0).map(|b| b.round() as i64),
            dz_album.and_then(|a| a.cover_xl.clone())
        ],
    )?;
    for (i, a) in t.artists().iter().enumerate() {
        let artist = upsert_artist(tx, &a.name)?;
        tx.execute(
            "INSERT OR IGNORE INTO track_artist(track_id, artist_id, role, position) VALUES (?1, ?2, 'artist', ?3)",
            params![id, artist, i as i64],
        )?;
        if a.id > 0 {
            tx.execute(
                "INSERT OR IGNORE INTO artist_source(provider, provider_id, artist_id) VALUES (?1, ?2, ?3)",
                params![DEEZER, a.id.to_string(), artist],
            )?;
        }
        if let Some(pic) = &a.picture_xl {
            tx.execute(
                "UPDATE artist SET image_url = ?2 WHERE id = ?1 AND image_url IS NULL",
                params![artist, pic],
            )?;
        }
    }
    link(&id)?;
    Ok(id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::online::deezer::{DzAlbum, DzArtist};

    fn get_lucky() -> DzTrack {
        DzTrack {
            id: 67238735,
            title: "Get Lucky".into(),
            duration: 369,
            track_position: Some(8),
            disk_number: Some(1),
            isrc: Some("USQX91300108".into()),
            artist: Some(DzArtist {
                id: 27,
                name: "Daft Punk".into(),
                ..Default::default()
            }),
            contributors: vec![DzArtist {
                id: 103,
                name: "Pharrell Williams".into(),
                ..Default::default()
            }],
            album: Some(DzAlbum {
                id: 6575789,
                title: "Random Access Memories".into(),
                cover_xl: Some(
                    "https://e-cdns-images.dzcdn.net/images/cover/x/1000x1000.jpg".into(),
                ),
                release_date: Some("2013-05-20".into()),
                ..Default::default()
            }),
            ..Default::default()
        }
    }

    #[test]
    fn stores_once_and_matches_the_album_the_scanner_names() {
        let db = crate::db::Db::memory().unwrap();
        let mut c = db.lock();
        let tx = c.transaction().unwrap();
        let id = store_track(&tx, &get_lucky()).unwrap();
        assert_eq!(
            store_track(&tx, &get_lucky()).unwrap(),
            id,
            "known: same id"
        );
        let (album, artists, year): (String, String, i64) = tx
            .query_row(
                "SELECT album_id, artist_display, year FROM track WHERE id = ?1",
                [&id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(
            album,
            ids::album_id(&ids::album_pid(None, "Daft Punk", "Random Access Memories"))
        );
        assert_eq!(artists, "Daft Punk • Pharrell Williams");
        assert_eq!(year, 2013);
        assert_eq!(
            known_album(&tx, 6575789).unwrap().as_deref(),
            Some(album.as_str())
        );
        assert!(known_artist(&tx, 103).unwrap().is_some());
    }

    #[test]
    fn links_to_the_library_track_of_the_same_recording() {
        let db = crate::db::Db::memory().unwrap();
        let mut c = db.lock();
        let tx = c.transaction().unwrap();
        tx.execute(
            "INSERT INTO track(id, title, norm_title, isrc) VALUES ('local', 'Get Lucky', 'get lucky', 'USQX91300108')",
            [],
        )
        .unwrap();
        assert_eq!(store_track(&tx, &get_lucky()).unwrap(), "local");
        assert_eq!(
            known_track(&tx, 67238735).unwrap().as_deref(),
            Some("local")
        );
    }
}
