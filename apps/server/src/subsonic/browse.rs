//! Browsing: artists, albums, songs, genres, lists, random songs, likes, similar songs, scan.

use std::collections::BTreeMap;

use rusqlite::{OptionalExtension, ToSql};
use serde_json::{Map, Value, json};

use super::{
    ApiError, Code, Ctx, Reply,
    model::{self, sort_key},
    one, online,
};
use crate::online::OnlineId;

const MAX_LIST: i64 = 500;

fn count(ctx: &Ctx, name: &str, default: i64) -> i64 {
    ctx.params
        .get(name)
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
        .clamp(0, MAX_LIST)
}

fn offset(ctx: &Ctx, name: &str) -> i64 {
    ctx.params
        .get(name)
        .and_then(|v| v.parse().ok())
        .unwrap_or(0)
        .max(0)
}

/// Artists grouped by first letter (`getArtists`, and `getIndexes` for older clients).
fn artist_index(rows: Vec<Value>) -> Value {
    let mut groups: BTreeMap<String, Vec<Value>> = BTreeMap::new();
    for a in rows {
        let name = a["name"].as_str().unwrap_or_default();
        let letter = sort_key(name)
            .chars()
            .next()
            .map(|c| c.to_uppercase().to_string())
            .filter(|c| c.chars().all(char::is_alphabetic))
            .unwrap_or_else(|| "#".into());
        groups.entry(letter).or_default().push(a);
    }
    json!({
        "ignoredArticles": "The Les Le La",
        "index": groups.into_iter().map(|(name, artist)| json!({ "name": name, "artist": artist })).collect::<Vec<_>>(),
    })
}

async fn all_artists(ctx: &Ctx) -> Result<Vec<Value>, ApiError> {
    let user = ctx.user.id.clone();
    let mut rows = ctx
        .state
        .db
        .call(move |c| Ok(model::artists(c, "1", "ar.name", "", &[&user])?))
        .await?;
    rows.sort_by_cached_key(|a| sort_key(a["name"].as_str().unwrap_or_default()));
    Ok(rows)
}

pub async fn get_artists(ctx: &Ctx) -> Reply {
    let rows = all_artists(ctx).await?;
    Ok(one("artists", artist_index(rows)))
}

pub async fn get_indexes(ctx: &Ctx) -> Reply {
    let rows = all_artists(ctx).await?;
    let mut idx = artist_index(rows);
    idx["lastModified"] = json!(0);
    Ok(one("indexes", idx))
}

pub async fn get_artist(ctx: &Ctx) -> Reply {
    let id = ctx.params.require("id")?.to_owned();
    if let Some(OnlineId::Artist(n)) = OnlineId::parse(&id) {
        return Ok(one("artist", online::get_artist(ctx, n, &id).await?));
    }
    let user = ctx.user.id.clone();
    let wanted = id.clone();
    let found = ctx
        .state
        .db
        .call(move |c| {
            let id = wanted;
            let artist = model::artists(c, "ar.id = ?2", "ar.name", "", &[&user, &id])?;
            let Some(mut artist) = artist.into_iter().next() else {
                return Ok(None);
            };
            let albums = model::albums(
                c,
                "al.id IN (SELECT album_id FROM album_artist WHERE artist_id = ?2)",
                "al.year DESC, al.title",
                "",
                &[&user, &id],
            )?;
            artist["album"] = json!(albums);
            Ok(Some(artist))
        })
        .await?;
    if let Some(a) = found {
        return Ok(one("artist", a));
    }
    // An artist known only online (credited on a liked song, for instance).
    match online::source_of(ctx, "artist", &id).await? {
        Some(n) => Ok(one("artist", online::get_artist(ctx, n, &id).await?)),
        None => Err(ApiError::not_found("Artist")),
    }
}

pub async fn get_album(ctx: &Ctx) -> Reply {
    let id = ctx.params.require("id")?.to_owned();
    if let Some(OnlineId::Album(n)) = OnlineId::parse(&id) {
        return Ok(one("album", online::get_album(ctx, n, &id).await?));
    }
    let user = ctx.user.id.clone();
    let wanted = id.clone();
    let found = ctx
        .state
        .db
        .call(move |c| {
            let id = wanted;
            let Some(mut album) = model::albums(c, "al.id = ?2", "al.id", "", &[&user, &id])?
                .into_iter()
                .next()
            else {
                return Ok(None);
            };
            album["song"] = json!(model::songs(
                c,
                &format!("t.album_id = ?2 AND {}", model::PLAYABLE),
                "coalesce(t.disc_number, 1), coalesce(t.track_number, 0), t.title",
                &[&user, &id],
            )?);
            Ok(Some(album))
        })
        .await?;
    if let Some(a) = found {
        return Ok(one("album", a));
    }
    match online::source_of(ctx, "album", &id).await? {
        Some(n) => Ok(one("album", online::get_album(ctx, n, &id).await?)),
        None => Err(ApiError::not_found("Album")),
    }
}

pub async fn get_song(ctx: &Ctx) -> Reply {
    let id = ctx.params.require("id")?.to_owned();
    if let Some(OnlineId::Track(n)) = OnlineId::parse(&id) {
        return Ok(one("song", online::get_song(ctx, n).await?));
    }
    let user = ctx.user.id.clone();
    let found = ctx
        .state
        .db
        .call(move |c| {
            Ok(model::songs(
                c,
                &format!("t.id = ?2 AND {}", model::PLAYABLE),
                "t.id",
                &[&user, &id],
            )?
            .into_iter()
            .next())
        })
        .await?;
    found
        .map(|s| one("song", s))
        .ok_or_else(|| ApiError::not_found("Song"))
}

/// Old folder-based browsing: an artist lists its albums, an album its songs.
pub async fn get_music_directory(ctx: &Ctx) -> Reply {
    let id = ctx.params.require("id")?.to_owned();
    if let Ok(album) = get_album(ctx).await {
        let a = &album["album"];
        return Ok(one(
            "directory",
            json!({ "id": id, "name": a["name"], "parent": a["artistId"], "child": a["song"] }),
        ));
    }
    let artist = get_artist(ctx).await?;
    let a = &artist["artist"];
    Ok(one(
        "directory",
        json!({ "id": id, "name": a["name"], "child": a["album"] }),
    ))
}

pub async fn get_genres(ctx: &Ctx) -> Reply {
    let genres: Vec<Value> = ctx
        .state
        .db
        .call(|c| {
            let mut st = c.prepare_cached(
                "SELECT g.name,
                        (SELECT count(*) FROM track_genre tg WHERE tg.genre_id = g.id
                            AND EXISTS (SELECT 1 FROM track_file f WHERE f.track_id = tg.track_id AND f.missing = 0)),
                        (SELECT count(*) FROM album_genre ag WHERE ag.genre_id = g.id)
                   FROM genre g ORDER BY g.name COLLATE NOCASE",
            )?;
            Ok(st
                .query_map([], |r| {
                    Ok(json!({ "value": r.get::<_, String>(0)?, "songCount": r.get::<_, i64>(1)?, "albumCount": r.get::<_, i64>(2)? }))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?)
        })
        .await?;
    Ok(one(
        "genres",
        json!({ "genre": genres.into_iter().filter(|g| g["songCount"] != 0).collect::<Vec<_>>() }),
    ))
}

/// `getAlbumList2` / `getAlbumList`.
pub async fn album_list(ctx: &Ctx, key: &str) -> Reply {
    use rusqlite::types::Value as Sql;

    let kind = ctx.params.require("type")?.to_owned();
    let size = count(ctx, "size", 10);
    let offset = offset(ctx, "offset");
    let year = |name: &str| ctx.params.get(name).and_then(|v| v.parse::<i64>().ok());
    // Filter and order on `al` / `an`, and the parameters the filter adds after ?1-?3.
    let (filter, order, extra): (&str, &str, Vec<Sql>) = match kind.as_str() {
        "random" => ("1", "random()", vec![]),
        "newest" => ("1", "al.created_at DESC, al.title", vec![]),
        "highest" => ("an.rating > 0", "an.rating DESC, al.title", vec![]),
        "frequent" => ("an.play_count > 0", "an.play_count DESC, al.title", vec![]),
        "recent" => (
            "an.last_played_at IS NOT NULL",
            "an.last_played_at DESC",
            vec![],
        ),
        "alphabeticalByName" => ("1", "al.title COLLATE NOCASE", vec![]),
        "alphabeticalByArtist" => (
            "1",
            "al.artist_display COLLATE NOCASE, al.year, al.title",
            vec![],
        ),
        "starred" => ("an.starred_at IS NOT NULL", "an.starred_at DESC", vec![]),
        "byGenre" => (
            "al.id IN (SELECT ag.album_id FROM album_genre ag JOIN genre g ON g.id = ag.genre_id
                        WHERE g.name = ?4 COLLATE NOCASE)",
            "al.title COLLATE NOCASE",
            vec![Sql::Text(ctx.params.require("genre")?.to_owned())],
        ),
        "byYear" => {
            let (Some(from), Some(to)) = (year("fromYear"), year("toYear")) else {
                return Err(ApiError::missing("fromYear and toYear"));
            };
            // fromYear > toYear lists newest first.
            let order = if from > to {
                "al.year DESC, al.title"
            } else {
                "al.year, al.title"
            };
            (
                "al.year BETWEEN ?4 AND ?5",
                order,
                vec![Sql::Integer(from.min(to)), Sql::Integer(from.max(to))],
            )
        }
        other => {
            return Err(ApiError::new(
                Code::Generic,
                format!("Unknown list type {other}"),
            ));
        }
    };
    let user = ctx.user.id.clone();
    let (filter, order) = (filter.to_owned(), order.to_owned());
    let rows = ctx
        .state
        .db
        .call(move |c| {
            let mut p: Vec<&dyn ToSql> = vec![&user, &size, &offset];
            p.extend(extra.iter().map(|v| v as &dyn ToSql));
            Ok(model::albums(c, &filter, &order, "LIMIT ?2 OFFSET ?3", &p)?)
        })
        .await?;
    Ok(one(key, json!({ "album": rows })))
}

/// Present files only, plus optional genre / years.
pub async fn random_songs(ctx: &Ctx) -> Reply {
    let size = count(ctx, "size", 10);
    let genre = ctx.params.get("genre").map(str::to_owned);
    let from: Option<i64> = ctx.params.get("fromYear").and_then(|v| v.parse().ok());
    let to: Option<i64> = ctx.params.get("toYear").and_then(|v| v.parse().ok());
    let user = ctx.user.id.clone();
    let rows = ctx
        .state
        .db
        .call(move |c| {
            let filter = &format!("{} AND (?3 IS NULL OR t.id IN (SELECT tg.track_id FROM track_genre tg JOIN genre g ON g.id = tg.genre_id WHERE g.name = ?3 COLLATE NOCASE))
                 AND (?4 IS NULL OR t.year >= ?4) AND (?5 IS NULL OR t.year <= ?5)", model::HAS_FILE);
            Ok(model::songs(c, filter, "random() LIMIT ?2", &[&user, &size, &genre, &from, &to])?)
        })
        .await?;
    Ok(one("randomSongs", json!({ "song": rows })))
}

pub async fn songs_by_genre(ctx: &Ctx) -> Reply {
    let genre = ctx.params.require("genre")?.to_owned();
    let size = count(ctx, "count", 10);
    let offset = offset(ctx, "offset");
    let user = ctx.user.id.clone();
    let rows = ctx
        .state
        .db
        .call(move |c| {
            Ok(model::songs(
                c,
                &format!("{} AND t.id IN (SELECT tg.track_id FROM track_genre tg JOIN genre g ON g.id = tg.genre_id WHERE g.name = ?2 COLLATE NOCASE)", model::HAS_FILE),
                "t.artist_display COLLATE NOCASE, t.album_id, t.disc_number, t.track_number LIMIT ?3 OFFSET ?4",
                &[&user, &genre, &size, &offset],
            )?)
        })
        .await?;
    Ok(one("songsByGenre", json!({ "song": rows })))
}

/// `getStarred2` / `getStarred`: what the user liked, newest first.
pub async fn starred(ctx: &Ctx, key: &str) -> Reply {
    let user = ctx.user.id.clone();
    let (songs, albums, artists) = ctx
        .state
        .db
        .call(move |c| {
            let songs = model::songs(
                c,
                &format!("a.starred_at IS NOT NULL AND {}", model::PLAYABLE),
                "a.starred_at DESC",
                &[&user],
            )?;
            let albums = model::albums(
                c,
                "an.starred_at IS NOT NULL",
                "an.starred_at DESC",
                "",
                &[&user],
            )?;
            let artists = model::artists(
                c,
                "an.starred_at IS NOT NULL",
                "an.starred_at DESC",
                "",
                &[&user],
            )?;
            Ok((songs, albums, artists))
        })
        .await?;
    Ok(one(
        key,
        json!({ "song": songs, "album": albums, "artist": artists }),
    ))
}

/// The artist's most played songs here (no external charts), then their first tracks.
pub async fn top_songs(ctx: &Ctx) -> Reply {
    let artist = ctx.params.require("artist")?.to_owned();
    let size = count(ctx, "count", 50);
    let user = ctx.user.id.clone();
    let rows = ctx
        .state
        .db
        .call(move |c| {
            Ok(model::songs(
                c,
                &format!("{} AND t.id IN (SELECT ta.track_id FROM track_artist ta JOIN artist ar ON ar.id = ta.artist_id
                          WHERE ar.name = ?2 COLLATE NOCASE AND ta.role = 'artist')", model::PLAYABLE),
                "(SELECT coalesce(sum(play_count), 0) FROM annotation WHERE item_type = 'track' AND item_id = t.id) DESC,
                 coalesce(t.track_number, 99), t.created_at LIMIT ?3",
                &[&user, &artist, &size],
            )?)
        })
        .await?;
    Ok(one("topSongs", json!({ "song": rows })))
}

/// Songs for a radio from an artist, album or song: the same artist(s) and genres, shuffled.
pub async fn similar_songs(ctx: &Ctx, key: &str) -> Reply {
    let id = ctx.params.require("id")?.to_owned();
    let size = count(ctx, "count", 50);
    let user = ctx.user.id.clone();
    let rows = ctx
        .state
        .db
        .call(move |c| {
            // Seed artists and genres from whatever the id is.
            let filter = &format!("{} AND t.id <> ?2 AND (
                  t.id IN (SELECT ta.track_id FROM track_artist ta WHERE ta.artist_id IN (
                      SELECT ?2 UNION SELECT artist_id FROM track_artist WHERE track_id = ?2
                      UNION SELECT artist_id FROM album_artist WHERE album_id = ?2))
               OR t.id IN (SELECT tg.track_id FROM track_genre tg WHERE tg.genre_id IN (
                      SELECT genre_id FROM track_genre WHERE track_id = ?2
                      UNION SELECT genre_id FROM album_genre WHERE album_id = ?2
                      UNION SELECT tg2.genre_id FROM track_genre tg2 JOIN track_artist ta2 ON ta2.track_id = tg2.track_id
                            WHERE ta2.artist_id = ?2)))", model::HAS_FILE);
            Ok(model::songs(c, filter, "random() LIMIT ?3", &[&user, &id, &size])?)
        })
        .await?;
    Ok(one(key, json!({ "song": rows })))
}

/// No biography yet; similar artists = artists sharing the most genres.
pub async fn artist_info(ctx: &Ctx, key: &str) -> Reply {
    let id = ctx.params.require("id")?.to_owned();
    let size = count(ctx, "count", 20);
    let user = ctx.user.id.clone();
    let similar = ctx
        .state
        .db
        .call(move |c| {
            Ok(model::artists(
                c,
                "ar.id <> ?2 AND ar.id IN (
                    SELECT ta.artist_id FROM track_artist ta JOIN track_genre tg ON tg.track_id = ta.track_id
                     WHERE tg.genre_id IN (SELECT tg2.genre_id FROM track_genre tg2 JOIN track_artist ta2
                                             ON ta2.track_id = tg2.track_id WHERE ta2.artist_id = ?2))",
                "random()",
                "LIMIT ?3",
                &[&user, &id, &size],
            )?)
        })
        .await?;
    Ok(one(
        key,
        json!({ "biography": "", "similarArtist": similar }),
    ))
}

pub async fn album_info(_ctx: &Ctx, key: &str) -> Reply {
    Ok(one(key, json!({ "notes": "" })))
}

pub async fn scan_status(ctx: &Ctx) -> Reply {
    let (files, folders): (i64, i64) = ctx
        .state
        .db
        .call(|c| {
            Ok(c.query_row(
                "SELECT (SELECT count(*) FROM track_file WHERE missing = 0), (SELECT count(*) FROM folder WHERE missing = 0)",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )?)
        })
        .await?;
    let last = ctx
        .state
        .db
        .call(|c| {
            Ok(
                c.query_row("SELECT max(last_scan_at) FROM library", [], |r| {
                    r.get::<_, Option<i64>>(0)
                })
                .optional()?
                .flatten(),
            )
        })
        .await?;
    let scanning = ctx
        .state
        .library
        .as_ref()
        .is_some_and(|l| l.status().scanning);
    let mut m = Map::new();
    m.insert("scanning".into(), json!(scanning));
    m.insert("count".into(), json!(files));
    m.insert("folderCount".into(), json!(folders));
    if let Some(t) = last {
        m.insert("lastScan".into(), json!(model::iso(t)));
    }
    Ok(one("scanStatus", Value::Object(m)))
}

pub async fn start_scan(ctx: &Ctx) -> Reply {
    if !ctx.user.is_admin {
        return Err(ApiError::forbidden());
    }
    let Some(lib) = &ctx.state.library else {
        return Err(ApiError::new(Code::Generic, "No music folder configured"));
    };
    lib.request(ctx.params.get("fullScan") == Some("true"));
    scan_status(ctx).await.map(|mut m| {
        if let Some(s) = m.get_mut("scanStatus") {
            s["scanning"] = json!(true);
        }
        m
    })
}
