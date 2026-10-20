//! Library rows as Subsonic / OpenSubsonic objects (songs, albums, artists), with the user's
//! likes, ratings and plays.
//!
//! The library (lists, random songs, genres, local search) is the tracks with a file present
//! ([`HAS_FILE`]). A track known only online ([`crate::online`]) shows where it was put: likes,
//! playlists, queue, plays ([`PLAYABLE`]); it joins the library once imported.

use rusqlite::{Connection, Row, ToSql};
use serde_json::{Map, Value, json};

/// Unix seconds as a UTC date (`2026-10-19`).
pub fn iso_date(secs: i64) -> String {
    iso(secs)[..10].to_owned()
}

/// Unix seconds as ISO 8601 UTC (`2026-10-19T20:30:00Z`).
pub fn iso(secs: i64) -> String {
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    // Civil date from days since 1970-01-01 (H. Hinnant's algorithm).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z",
        rem / 3600,
        rem % 3600 / 60,
        rem % 60
    )
}

fn mime(format: &str) -> &'static str {
    match format {
        "mp3" => "audio/mpeg",
        "flac" => "audio/flac",
        "m4a" | "mp4" | "aac" | "alac" => "audio/mp4",
        "ogg" | "oga" => "audio/ogg",
        "opus" => "audio/ogg; codecs=opus",
        "wav" => "audio/wav",
        "aif" | "aiff" => "audio/aiff",
        "wv" => "audio/x-wavpack",
        "ape" => "audio/x-ape",
        "wma" => "audio/x-ms-wma",
        _ => "application/octet-stream",
    }
}

pub fn content_type(format: &str) -> &'static str {
    mime(format)
}

/// `id<US>name<RS>id<US>name…` → `[{id, name}]`.
fn refs(packed: Option<String>) -> Vec<Value> {
    packed
        .unwrap_or_default()
        .split('\u{1e}')
        .filter(|p| !p.is_empty())
        .filter_map(|p| p.split_once('\u{1f}'))
        .map(|(id, name)| json!({ "id": id, "name": name }))
        .collect()
}

fn put(m: &mut Map<String, Value>, k: &str, v: Option<impl Into<Value>>) {
    if let Some(v) = v {
        m.insert(k.into(), v.into());
    }
}

// Songs -----------------------------------------------------------------------------------

/// A file of the track is present (filters on [`SONG_SELECT`]).
pub const HAS_FILE: &str = "f.id IS NOT NULL";

/// The track can be shown and played: a file is present, or an online source is known.
pub const PLAYABLE: &str =
    "(f.id IS NOT NULL OR EXISTS (SELECT 1 FROM track_source s WHERE s.track_id = t.id))";

/// [`PLAYABLE`] for a track id column, outside [`SONG_SELECT`].
pub fn playable(track_col: &str) -> String {
    format!(
        "(EXISTS (SELECT 1 FROM track_file f WHERE f.track_id = {track_col} AND f.missing = 0)
          OR EXISTS (SELECT 1 FROM track_source s WHERE s.track_id = {track_col}))"
    )
}

/// Song columns; `?1` is the user id. Join on `t` (track), `f` (its best file, if any). Use
/// with [`song`] and a filter ([`HAS_FILE`] or [`PLAYABLE`]).
pub const SONG_SELECT: &str = "
SELECT t.id, t.title, t.artist_display, t.album_id, al.title, al.artist_display,
       t.track_number, t.disc_number, t.year, t.duration_ms, t.bpm, t.created_at,
       f.path, f.size, f.format, f.bit_rate, f.sample_rate, f.channels, f.bit_depth,
       a.starred_at, a.rating, a.play_count, a.last_played_at,
       (SELECT group_concat(g.name, char(30)) FROM track_genre tg JOIN genre g ON g.id = tg.genre_id
         WHERE tg.track_id = t.id),
       (SELECT group_concat(ar.id || char(31) || ar.name, char(30) ORDER BY ta.position)
          FROM track_artist ta JOIN artist ar ON ar.id = ta.artist_id
         WHERE ta.track_id = t.id AND ta.role = 'artist'),
       (SELECT group_concat(ar.id || char(31) || ar.name, char(30) ORDER BY aa.position)
          FROM album_artist aa JOIN artist ar ON ar.id = aa.artist_id WHERE aa.album_id = t.album_id),
       t.isrc, al.cover_ref, coalesce(al.cover_url, t.cover_url)
  FROM track t
  LEFT JOIN track_file f ON f.id = (SELECT id FROM track_file WHERE track_id = t.id AND missing = 0
                                ORDER BY coalesce(bit_rate, 0) DESC, id LIMIT 1)
  LEFT JOIN album al ON al.id = t.album_id
  LEFT JOIN annotation a ON a.user_id = ?1 AND a.item_type = 'track' AND a.item_id = t.id";

pub fn song(r: &Row) -> rusqlite::Result<Value> {
    let id: String = r.get(0)?;
    let album_id: Option<String> = r.get(3)?;
    // No file: an online track, served as MP3 by a provider.
    let format: String = r
        .get::<_, Option<String>>(14)?
        .unwrap_or_else(|| "mp3".to_owned());
    let genres: Vec<String> = r
        .get::<_, Option<String>>(23)?
        .unwrap_or_default()
        .split('\u{1e}')
        .filter(|g| !g.is_empty())
        .map(str::to_owned)
        .collect();
    let artists = refs(r.get(24)?);
    let album_artists = refs(r.get(25)?);
    let has_cover =
        r.get::<_, Option<String>>(27)?.is_some() || r.get::<_, Option<String>>(28)?.is_some();
    let mut m = Map::new();
    m.insert("id".into(), json!(id));
    m.insert("isDir".into(), json!(false));
    m.insert("title".into(), json!(r.get::<_, String>(1)?));
    put(&mut m, "parent", album_id.clone());
    put(&mut m, "albumId", album_id.clone());
    put(&mut m, "album", r.get::<_, Option<String>>(4)?);
    let artist: String = r.get(2)?;
    m.insert("artist".into(), json!(artist));
    m.insert("displayArtist".into(), json!(artist));
    if let Some(first) = artists.first() {
        m.insert("artistId".into(), first["id"].clone());
    }
    m.insert("artists".into(), json!(artists));
    put(&mut m, "displayAlbumArtist", r.get::<_, Option<String>>(5)?);
    m.insert("albumArtists".into(), json!(album_artists));
    put(&mut m, "track", r.get::<_, Option<i64>>(6)?);
    put(&mut m, "discNumber", r.get::<_, Option<i64>>(7)?);
    put(&mut m, "year", r.get::<_, Option<i64>>(8)?);
    if let Some(g) = genres.first() {
        m.insert("genre".into(), json!(g));
    }
    m.insert(
        "genres".into(),
        json!(
            genres
                .iter()
                .map(|g| json!({ "name": g }))
                .collect::<Vec<_>>()
        ),
    );
    if has_cover {
        put(&mut m, "coverArt", album_id);
    }
    let duration_ms: i64 = r.get(9)?;
    m.insert("duration".into(), json!((duration_ms + 500) / 1000));
    put(&mut m, "bpm", r.get::<_, Option<i64>>(10)?);
    m.insert("created".into(), json!(iso(r.get(11)?)));
    put(&mut m, "path", r.get::<_, Option<String>>(12)?);
    put(&mut m, "size", r.get::<_, Option<i64>>(13)?);
    m.insert("suffix".into(), json!(format));
    m.insert("contentType".into(), json!(mime(&format)));
    put(&mut m, "bitRate", r.get::<_, Option<i64>>(15)?);
    put(&mut m, "samplingRate", r.get::<_, Option<i64>>(16)?);
    put(&mut m, "channelCount", r.get::<_, Option<i64>>(17)?);
    put(&mut m, "bitDepth", r.get::<_, Option<i64>>(18)?);
    put(&mut m, "starred", r.get::<_, Option<i64>>(19)?.map(iso));
    let rating: Option<i64> = r.get(20)?;
    put(&mut m, "userRating", rating.filter(|r| *r > 0));
    m.insert(
        "playCount".into(),
        json!(r.get::<_, Option<i64>>(21)?.unwrap_or(0)),
    );
    put(&mut m, "played", r.get::<_, Option<i64>>(22)?.map(iso));
    if let Some(isrc) = r.get::<_, Option<String>>(26)? {
        m.insert("isrc".into(), json!([isrc]));
    }
    m.insert("type".into(), json!("music"));
    m.insert("mediaType".into(), json!("song"));
    Ok(Value::Object(m))
}

/// Songs matching `filter` (SQL after `WHERE`, may use `?1` = user and further parameters;
/// include [`HAS_FILE`] or [`PLAYABLE`]), ordered by `order`.
pub fn songs(
    c: &Connection,
    filter: &str,
    order: &str,
    params: &[&dyn ToSql],
) -> rusqlite::Result<Vec<Value>> {
    let sql = format!("{SONG_SELECT} WHERE {filter} ORDER BY {order}");
    let mut st = c.prepare_cached(&sql)?;
    st.query_map(params, song)?.collect()
}

// Albums ----------------------------------------------------------------------------------

/// Album columns, counting the tracks that match `tracks` (SQL on `t`); albums without any
/// such track are left out. `?1` is the user id.
fn album_select(tracks: &str) -> String {
    format!(
        "SELECT al.id, al.title, al.artist_display, al.year, al.created_at,
                coalesce(al.cover_ref, al.cover_url), al.release_date, al.compilation,
                count(t.id), sum(t.duration_ms),
                an.starred_at, an.rating, an.play_count, an.last_played_at,
                (SELECT group_concat(g.name, char(30)) FROM album_genre ag JOIN genre g ON g.id = ag.genre_id
                  WHERE ag.album_id = al.id),
                (SELECT group_concat(ar.id || char(31) || ar.name, char(30) ORDER BY aa.position)
                   FROM album_artist aa JOIN artist ar ON ar.id = aa.artist_id WHERE aa.album_id = al.id)
           FROM album al
           JOIN track t ON t.album_id = al.id AND {tracks}
           LEFT JOIN annotation an ON an.user_id = ?1 AND an.item_type = 'album' AND an.item_id = al.id"
    )
}

/// Albums of the library: at least one file present.
pub fn album_select_library() -> String {
    album_select("EXISTS (SELECT 1 FROM track_file f WHERE f.track_id = t.id AND f.missing = 0)")
}

pub fn album(r: &Row) -> rusqlite::Result<Value> {
    let id: String = r.get(0)?;
    let genres: Vec<String> = r
        .get::<_, Option<String>>(14)?
        .unwrap_or_default()
        .split('\u{1e}')
        .filter(|g| !g.is_empty())
        .map(str::to_owned)
        .collect();
    let artists = refs(r.get(15)?);
    let mut m = Map::new();
    m.insert("id".into(), json!(id));
    let title: String = r.get(1)?;
    m.insert("name".into(), json!(title));
    m.insert("title".into(), json!(title));
    m.insert("album".into(), json!(title));
    m.insert("isDir".into(), json!(true));
    let artist: String = r.get(2)?;
    m.insert("artist".into(), json!(artist));
    m.insert("displayArtist".into(), json!(artist));
    if let Some(first) = artists.first() {
        m.insert("artistId".into(), first["id"].clone());
        m.insert("parent".into(), first["id"].clone());
    }
    m.insert("artists".into(), json!(artists));
    put(&mut m, "year", r.get::<_, Option<i64>>(3)?);
    m.insert("created".into(), json!(iso(r.get(4)?)));
    if r.get::<_, Option<String>>(5)?.is_some() {
        m.insert("coverArt".into(), json!(id));
    }
    if let Some(date) = r.get::<_, Option<String>>(6)? {
        let mut parts = date.split('-').map(|p| p.parse::<i64>().ok());
        let (y, mo, d) = (
            parts.next().flatten(),
            parts.next().flatten(),
            parts.next().flatten(),
        );
        if let Some(y) = y {
            m.insert(
                "releaseDate".into(),
                json!({ "year": y, "month": mo, "day": d }),
            );
        }
    }
    m.insert("isCompilation".into(), json!(r.get::<_, i64>(7)? != 0));
    m.insert("songCount".into(), json!(r.get::<_, i64>(8)?));
    m.insert(
        "duration".into(),
        json!((r.get::<_, Option<i64>>(9)?.unwrap_or(0) + 500) / 1000),
    );
    put(&mut m, "starred", r.get::<_, Option<i64>>(10)?.map(iso));
    let rating: Option<i64> = r.get(11)?;
    put(&mut m, "userRating", rating.filter(|r| *r > 0));
    m.insert(
        "playCount".into(),
        json!(r.get::<_, Option<i64>>(12)?.unwrap_or(0)),
    );
    put(&mut m, "played", r.get::<_, Option<i64>>(13)?.map(iso));
    if let Some(g) = genres.first() {
        m.insert("genre".into(), json!(g));
    }
    m.insert(
        "genres".into(),
        json!(
            genres
                .iter()
                .map(|g| json!({ "name": g }))
                .collect::<Vec<_>>()
        ),
    );
    m.insert("mediaType".into(), json!("album"));
    Ok(Value::Object(m))
}

/// Albums of the library matching `filter` (SQL on `al`, `an`), ordered by `order`, with
/// `LIMIT`/`OFFSET` given as further parameters when wanted (`page` = "LIMIT ?n OFFSET ?m").
pub fn albums(
    c: &Connection,
    filter: &str,
    order: &str,
    page: &str,
    params: &[&dyn ToSql],
) -> rusqlite::Result<Vec<Value>> {
    let sql = format!(
        "{} WHERE {filter} GROUP BY al.id ORDER BY {order} {page}",
        album_select_library()
    );
    let mut st = c.prepare_cached(&sql)?;
    st.query_map(params, album)?.collect()
}

/// Like [`albums`], also with albums known only online (liked ones, for instance).
pub fn albums_playable(
    c: &Connection,
    filter: &str,
    order: &str,
    params: &[&dyn ToSql],
) -> rusqlite::Result<Vec<Value>> {
    let sql = format!(
        "{} WHERE {filter} GROUP BY al.id ORDER BY {order}",
        album_select(&playable("t.id"))
    );
    let mut st = c.prepare_cached(&sql)?;
    st.query_map(params, album)?.collect()
}

// Artists ---------------------------------------------------------------------------------

/// Album artists with at least one album present; `?1` is the user id.
pub const ARTIST_SELECT: &str = "
SELECT ar.id, ar.name, ar.sort_name, count(DISTINCT aa.album_id), an.starred_at, ar.image_url,
       (SELECT al2.id FROM album_artist aa2 JOIN album al2 ON al2.id = aa2.album_id
         WHERE aa2.artist_id = ar.id AND al2.cover_ref IS NOT NULL
         ORDER BY al2.year DESC LIMIT 1)
  FROM artist ar
  JOIN album_artist aa ON aa.artist_id = ar.id
   AND EXISTS (SELECT 1 FROM track t JOIN track_file f ON f.track_id = t.id
                WHERE t.album_id = aa.album_id AND f.missing = 0)
  LEFT JOIN annotation an ON an.user_id = ?1 AND an.item_type = 'artist' AND an.item_id = ar.id";

pub fn artist(r: &Row) -> rusqlite::Result<Value> {
    let mut m = Map::new();
    m.insert("id".into(), json!(r.get::<_, String>(0)?));
    m.insert("name".into(), json!(r.get::<_, String>(1)?));
    let sort: String = r.get(2)?;
    if !sort.is_empty() {
        m.insert("sortName".into(), json!(sort));
    }
    m.insert("albumCount".into(), json!(r.get::<_, i64>(3)?));
    put(&mut m, "starred", r.get::<_, Option<i64>>(4)?.map(iso));
    put(&mut m, "artistImageUrl", r.get::<_, Option<String>>(5)?);
    if let Some(album) = r.get::<_, Option<String>>(6)? {
        m.insert("coverArt".into(), json!(album));
    }
    Ok(Value::Object(m))
}

/// Artists, also those known only online (liked ones, for instance); `?1` is the user id.
pub fn artists_playable(
    c: &Connection,
    filter: &str,
    order: &str,
    params: &[&dyn ToSql],
) -> rusqlite::Result<Vec<Value>> {
    let sql = format!(
        "SELECT ar.id, ar.name, ar.sort_name, count(DISTINCT aa.album_id), an.starred_at, ar.image_url,
                (SELECT al2.id FROM album_artist aa2 JOIN album al2 ON al2.id = aa2.album_id
                  WHERE aa2.artist_id = ar.id AND coalesce(al2.cover_ref, al2.cover_url) IS NOT NULL
                  ORDER BY al2.year DESC LIMIT 1)
           FROM artist ar
           LEFT JOIN album_artist aa ON aa.artist_id = ar.id
           LEFT JOIN annotation an ON an.user_id = ?1 AND an.item_type = 'artist' AND an.item_id = ar.id
          WHERE {filter} GROUP BY ar.id ORDER BY {order}"
    );
    let mut st = c.prepare_cached(&sql)?;
    st.query_map(params, artist)?.collect()
}

pub fn artists(
    c: &Connection,
    filter: &str,
    order: &str,
    page: &str,
    params: &[&dyn ToSql],
) -> rusqlite::Result<Vec<Value>> {
    let sql = format!("{ARTIST_SELECT} WHERE {filter} GROUP BY ar.id ORDER BY {order} {page}");
    let mut st = c.prepare_cached(&sql)?;
    st.query_map(params, artist)?.collect()
}

/// Sort key ignoring a leading article, like most players.
pub fn sort_key(name: &str) -> String {
    let lower = name.to_lowercase();
    for article in ["the ", "les ", "le ", "la ", "l'", "a "] {
        if let Some(rest) = lower.strip_prefix(article)
            && !rest.is_empty()
        {
            return rest.to_owned();
        }
    }
    lower
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn iso_dates() {
        assert_eq!(iso(0), "1970-01-01T00:00:00Z");
        assert_eq!(iso(1_760_905_800), "2025-10-19T20:30:00Z");
        assert_eq!(iso(951_782_400), "2000-02-29T00:00:00Z");
    }

    #[test]
    fn articles_are_ignored_for_sorting() {
        assert_eq!(sort_key("The Beatles"), "beatles");
        assert_eq!(sort_key("Les Rita Mitsouko"), "rita mitsouko");
        assert_eq!(sort_key("The"), "the");
    }
}
