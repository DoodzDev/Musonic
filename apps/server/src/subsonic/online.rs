//! Online items through the Subsonic API: `dz-…` ids turned into library tracks when used,
//! online songs, albums and artists shown, search results beyond the library.

use std::collections::{HashMap, HashSet};

use rusqlite::OptionalExtension;
use serde_json::{Value, json};

use super::{ApiError, Code, Ctx, model};
use crate::{
    matcher::normalize,
    online::{
        Deezer, OnlineId,
        deezer::{DzAlbum, DzTrack},
        render, store,
    },
};

fn catalog(ctx: &Ctx) -> Result<&Deezer, ApiError> {
    ctx.state
        .online
        .as_deref()
        .ok_or_else(|| ApiError::not_found("Online item"))
}

fn unavailable(e: anyhow::Error) -> ApiError {
    tracing::warn!("online catalog: {e:#}");
    ApiError::new(
        Code::Generic,
        "The online catalog is unavailable, try again later",
    )
}

/// Library ids for `ids`, in order: library ids as they are, `dz-track-…` ones stored first
/// when new (see [`crate::online`]).
pub async fn resolve_tracks(ctx: &Ctx, ids: Vec<String>) -> Result<Vec<String>, ApiError> {
    let online: Vec<u64> = ids
        .iter()
        .filter_map(|id| match OnlineId::parse(id) {
            Some(OnlineId::Track(n)) => Some(n),
            _ => None,
        })
        .collect();
    if online.is_empty() {
        return Ok(ids);
    }
    let wanted = online.clone();
    let mut known: HashMap<u64, String> = ctx
        .state
        .db
        .call(move |c| {
            let mut out = HashMap::new();
            for n in wanted {
                if let Some(id) = store::known_track(c, n)? {
                    out.insert(n, id);
                }
            }
            Ok(out)
        })
        .await?;
    let mut fetched: Vec<DzTrack> = Vec::new();
    for n in online.iter().filter(|n| !known.contains_key(n)) {
        if fetched.iter().any(|t| t.id == *n) {
            continue;
        }
        match catalog(ctx)?.track(*n).await.map_err(unavailable)? {
            Some(t) => fetched.push(t),
            None => {
                return Err(ApiError::new(
                    Code::NotFound,
                    format!("Song not found: {}", crate::online::track_id(*n)),
                ));
            }
        }
    }
    if !fetched.is_empty() {
        let stored: Vec<(u64, String)> = ctx
            .state
            .db
            .call(move |c| {
                let tx = c.transaction()?;
                let mut out = Vec::new();
                for t in &fetched {
                    out.push((t.id, store::store_track(&tx, t)?));
                }
                tx.commit()?;
                Ok(out)
            })
            .await?;
        known.extend(stored);
    }
    Ok(ids
        .into_iter()
        .map(|id| match OnlineId::parse(&id) {
            Some(OnlineId::Track(n)) => known.get(&n).cloned().unwrap_or(id),
            _ => id,
        })
        .collect())
}

/// An online album stored in the library (its songs stored as tracks without a file): the
/// album's library id and its tracks' ids.
pub async fn resolve_album(ctx: &Ctx, n: u64) -> Result<(String, Vec<String>), ApiError> {
    let a = catalog(ctx)?
        .album(n)
        .await
        .map_err(unavailable)?
        .ok_or_else(|| ApiError::not_found("Album"))?;
    let ids = a
        .tracks
        .data
        .iter()
        .map(|t| crate::online::track_id(t.id))
        .collect();
    let tracks = resolve_tracks(ctx, ids).await?;
    let first = tracks.first().cloned();
    let album: Option<String> = ctx
        .state
        .db
        .call(move |c| {
            if let Some(id) = store::known_album(c, n)? {
                return Ok(Some(id));
            }
            // An album the songs were linked to in the library.
            Ok(match first {
                Some(t) => c
                    .query_row("SELECT album_id FROM track WHERE id = ?1", [&t], |r| {
                        r.get(0)
                    })
                    .optional()?
                    .flatten(),
                None => None,
            })
        })
        .await?;
    let album = album.ok_or_else(|| ApiError::not_found("Album"))?;
    Ok((album, tracks))
}

/// An online artist stored in the library: their library id.
pub async fn resolve_artist(ctx: &Ctx, n: u64) -> Result<String, ApiError> {
    let a = catalog(ctx)?
        .artist(n)
        .await
        .map_err(unavailable)?
        .ok_or_else(|| ApiError::not_found("Artist"))?;
    Ok(ctx
        .state
        .db
        .call(move |c| {
            let tx = c.transaction()?;
            let id = crate::library::scanner::upsert_artist(&tx, &a.name)?;
            tx.execute(
                "INSERT OR IGNORE INTO artist_source(provider, provider_id, artist_id) VALUES (?1, ?2, ?3)",
                rusqlite::params![crate::online::DEEZER, n.to_string(), id],
            )?;
            if let Some(pic) = &a.picture_xl {
                tx.execute(
                    "UPDATE artist SET image_url = ?2 WHERE id = ?1 AND image_url IS NULL",
                    rusqlite::params![id, pic],
                )?;
            }
            tx.commit()?;
            Ok(id)
        })
        .await?)
}

/// Online tracks as songs: the library's song when the track is known, else the online one.
async fn songs(
    ctx: &Ctx,
    tracks: &[DzTrack],
    album: Option<&DzAlbum>,
) -> Result<Vec<Value>, ApiError> {
    let ids: Vec<u64> = tracks.iter().map(|t| t.id).collect();
    let user = ctx.user.id.clone();
    let mut library: HashMap<u64, Value> = ctx
        .state
        .db
        .call(move |c| {
            let mut out = HashMap::new();
            for n in ids {
                let Some(id) = store::known_track(c, n)? else {
                    continue;
                };
                if let Some(s) = model::songs(
                    c,
                    &format!("t.id = ?2 AND {}", model::PLAYABLE),
                    "t.id",
                    &[&user, &id],
                )?
                .into_iter()
                .next()
                {
                    out.insert(n, s);
                }
            }
            Ok(out)
        })
        .await?;
    Ok(tracks
        .iter()
        .map(|t| {
            library
                .remove(&t.id)
                .unwrap_or_else(|| render::song(t, album))
        })
        .collect())
}

pub async fn get_song(ctx: &Ctx, n: u64) -> Result<Value, ApiError> {
    let t = catalog(ctx)?
        .track(n)
        .await
        .map_err(unavailable)?
        .ok_or_else(|| ApiError::not_found("Song"))?;
    Ok(songs(ctx, std::slice::from_ref(&t), None).await?.remove(0))
}

/// An online album with its songs; `shown_id` = the id the client asked for.
pub async fn get_album(ctx: &Ctx, n: u64, shown_id: &str) -> Result<Value, ApiError> {
    let a = catalog(ctx)?
        .album(n)
        .await
        .map_err(unavailable)?
        .ok_or_else(|| ApiError::not_found("Album"))?;
    let mut album = render::album(&a, Some(shown_id));
    album["song"] = json!(songs(ctx, &a.tracks.data, Some(&a)).await?);
    Ok(album)
}

/// An online artist with their albums.
pub async fn get_artist(ctx: &Ctx, n: u64, shown_id: &str) -> Result<Value, ApiError> {
    let dz = catalog(ctx)?;
    let (artist, albums) = tokio::join!(dz.artist(n), dz.artist_albums(n));
    let a = artist
        .map_err(unavailable)?
        .ok_or_else(|| ApiError::not_found("Artist"))?;
    let albums: Vec<Value> = albums
        .unwrap_or_default()
        .iter()
        .map(|al| {
            let mut v = render::album(al, None);
            // Albums of an artist page come without their artist.
            if al.artist.is_none() {
                v["artist"] = json!(a.name);
                v["artistId"] = json!(shown_id);
            }
            v
        })
        .collect();
    let mut artist = render::artist(&a, Some(shown_id));
    artist["albumCount"] = json!(albums.len());
    artist["album"] = json!(albums);
    Ok(artist)
}

/// Picture of an online item: album cover, artist photo, a track's album cover.
pub async fn cover_url(ctx: &Ctx, item: OnlineId) -> Result<Option<String>, ApiError> {
    let dz = catalog(ctx)?;
    Ok(match item {
        OnlineId::Album(n) => dz
            .album(n)
            .await
            .map_err(unavailable)?
            .and_then(|a| a.cover_xl),
        OnlineId::Artist(n) => dz
            .artist(n)
            .await
            .map_err(unavailable)?
            .and_then(|a| a.picture_xl),
        OnlineId::Track(n) => dz
            .track(n)
            .await
            .map_err(unavailable)?
            .and_then(|t| t.album)
            .and_then(|a| a.cover_xl),
    })
}

/// The Deezer album / artist behind a canonical id, for library items known only online.
pub async fn source_of(ctx: &Ctx, kind: &'static str, id: &str) -> Result<Option<u64>, ApiError> {
    let (table, column) = match kind {
        "album" => ("album_source", "album_id"),
        _ => ("artist_source", "artist_id"),
    };
    let id = id.to_owned();
    Ok(ctx
        .state
        .db
        .call(move |c| Ok(store::source_of(c, table, column, &id)?))
        .await?)
}

/// Search results beyond the library, after the local ones (first page only). Items already in
/// the local results are left out. Never fails: without the catalog, nothing is added.
pub async fn search_more(
    ctx: &Ctx,
    query: &str,
    counts: (i64, i64, i64),
    local: (&[Value], &[Value], &[Value]),
) -> (Vec<Value>, Vec<Value>, Vec<Value>) {
    let Some(dz) = ctx.state.online.as_deref() else {
        return Default::default();
    };
    let (ac, lc, sc) = counts;
    let (artists, albums, tracks) = tokio::join!(
        async {
            if ac > 0 {
                dz.search_artists(query, ac).await
            } else {
                Ok(vec![])
            }
        },
        async {
            if lc > 0 {
                dz.search_albums(query, lc).await
            } else {
                Ok(vec![])
            }
        },
        async {
            if sc > 0 {
                dz.search_tracks(query, sc).await
            } else {
                Ok(vec![])
            }
        },
    );
    // Title and main artist: online search results credit the main artist only.
    let key = |v: &Value, name: &str| {
        let artist = v["artist"].as_str().unwrap_or_default();
        format!(
            "{}\u{1f}{}",
            normalize(v[name].as_str().unwrap_or_default()),
            normalize(artist.split('•').next().unwrap_or_default())
        )
    };
    let (local_artists, local_albums, local_songs) = local;
    let seen_artists: HashSet<String> = local_artists.iter().map(|a| key(a, "name")).collect();
    let seen_albums: HashSet<String> = local_albums.iter().map(|a| key(a, "name")).collect();
    let seen_songs: HashSet<&str> = local_songs
        .iter()
        .filter_map(|s| s["id"].as_str())
        .collect();
    let same_songs: HashSet<String> = local_songs.iter().map(|s| key(s, "title")).collect();

    let artists = artists
        .unwrap_or_else(|e| {
            tracing::debug!("online artist search: {e:#}");
            vec![]
        })
        .iter()
        .map(|a| render::artist(a, None))
        .filter(|a| !seen_artists.contains(&key(a, "name")))
        .collect();
    let albums = albums
        .unwrap_or_default()
        .iter()
        .map(|a| render::album(a, None))
        .filter(|a| !seen_albums.contains(&key(a, "name")))
        .collect();
    let tracks = tracks.unwrap_or_default();
    let songs = songs(ctx, &tracks, None)
        .await
        .unwrap_or_default()
        .into_iter()
        .filter(|s| {
            !s["id"].as_str().is_some_and(|id| seen_songs.contains(id))
                && !same_songs.contains(&key(s, "title"))
        })
        .collect();
    (artists, albums, songs)
}
