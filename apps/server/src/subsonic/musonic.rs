//! Routes of Musonic's own clients (ADR-021), announced by the `musonicServer` OpenSubsonic
//! extension. They answer in one request what a generic Subsonic client asks in many, and go
//! through the same path as the other routes: API key, kept answers, `ETag`, gzip.
//!
//! | Route | Answer |
//! |---|---|
//! | `getMusonicLibrary` | `musonicLibrary`: `total` and every song of the library with a file, only the fields the clients use (no likes or plays: they change often, see `getStarred2`) |
//! | `getMusonicHome` | `musonicHome`: the first wave of the home screen (`recent`, `frequent`, `newest`, `random` albums, `starred`, `playlists`) |
//! | `getMusonicHomeMore?artist=&song=&genre=…` | `musonicHomeMore`: its second wave, chained here (`similarArtistAlbums`: the latest album of up to 4 artists like `artist`, `similarSongs`, `genreMixes`) |

use futures_util::future::join_all;
use serde_json::{Map, Value, json};

use super::{ApiError, Ctx, Params, Reply, dispatch, model, one};

/// Fields of a song the clients read; the others (likes, plays, paths…) stay out of the list.
const LIBRARY_FIELDS: [&str; 15] = [
    "id", "title", "artist", "artistId", "artists", "album", "albumId", "coverArt", "duration",
    "suffix", "bitRate", "created", "track", "year", "genre",
];

pub async fn library(ctx: &Ctx) -> Reply {
    let user = ctx.user.id.clone();
    let songs = ctx
        .state
        .db
        .call(move |c| {
            Ok(model::songs(
                c,
                model::HAS_FILE,
                "t.title COLLATE NOCASE, t.id",
                &[&user],
            )?)
        })
        .await?;
    let songs: Vec<Value> = songs
        .into_iter()
        .map(|song| match song {
            Value::Object(mut m) => {
                m.retain(|k, _| LIBRARY_FIELDS.contains(&k.as_str()));
                Value::Object(m)
            }
            other => other,
        })
        .collect();
    Ok(one(
        "musonicLibrary",
        json!({ "total": songs.len(), "song": songs }),
    ))
}

/// The answer of another route for the same user, as if the client had asked it.
async fn route(ctx: &Ctx, name: &str, params: &[(&str, &str)]) -> Map<String, Value> {
    let sub = Ctx {
        state: ctx.state.clone(),
        user: ctx.user.clone(),
        params: Params(
            params
                .iter()
                .map(|(k, v)| ((*k).to_owned(), (*v).to_owned()))
                .collect(),
        ),
        headers: ctx.headers.clone(),
    };
    // A failing source only hides its shelf, as in the clients.
    Box::pin(dispatch(&sub, name)).await.unwrap_or_default()
}

/// `answer[key][list]`, or an empty list.
fn list(answer: &Map<String, Value>, key: &str, list: &str) -> Value {
    answer
        .get(key)
        .and_then(|v| v.get(list))
        .cloned()
        .unwrap_or_else(|| json!([]))
}

pub async fn home(ctx: &Ctx) -> Reply {
    let (recent, frequent, newest, random, starred, playlists) = tokio::join!(
        route(ctx, "getAlbumList2", &[("type", "recent"), ("size", "24")]),
        route(
            ctx,
            "getAlbumList2",
            &[("type", "frequent"), ("size", "40")]
        ),
        route(ctx, "getAlbumList2", &[("type", "newest"), ("size", "16")]),
        route(ctx, "getAlbumList2", &[("type", "random"), ("size", "16")]),
        route(ctx, "getStarred2", &[]),
        route(ctx, "getPlaylists", &[]),
    );
    let starred = starred
        .get("starred2")
        .cloned()
        .unwrap_or_else(|| json!({}));
    Ok(one(
        "musonicHome",
        json!({
            "recent": list(&recent, "albumList2", "album"),
            "frequent": list(&frequent, "albumList2", "album"),
            "newest": list(&newest, "albumList2", "album"),
            "random": list(&random, "albumList2", "album"),
            "starred": {
                "song": starred.get("song").cloned().unwrap_or_else(|| json!([])),
                "album": starred.get("album").cloned().unwrap_or_else(|| json!([])),
                "artist": starred.get("artist").cloned().unwrap_or_else(|| json!([])),
            },
            "playlists": list(&playlists, "playlists", "playlist"),
        }),
    ))
}

/// The latest album of up to 4 artists like this one, one each, for variety.
async fn similar_artist_albums(ctx: &Ctx, artist: &str) -> Vec<Value> {
    let info = route(ctx, "getArtistInfo2", &[("id", artist), ("count", "8")]).await;
    let ids: Vec<String> = list(&info, "artistInfo2", "similarArtist")
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|a| a.get("id").and_then(Value::as_str))
        .filter(|id| !id.is_empty())
        .take(4)
        .map(str::to_owned)
        .collect();
    let artists = join_all(
        ids.iter()
            .map(|id| async move { route(ctx, "getArtist", &[("id", id.as_str())]).await }),
    )
    .await;
    artists
        .iter()
        .filter_map(|a| {
            list(a, "artist", "album")
                .as_array()?
                .iter()
                .max_by_key(|al| al.get("year").and_then(Value::as_i64).unwrap_or(0))
                .cloned()
        })
        .collect()
}

pub async fn home_more(ctx: &Ctx) -> Reply {
    // An id here (a name for `getLyrics`): old ids still work (ADR-026).
    let artist = ctx
        .params
        .get("artist")
        .filter(|v| !v.is_empty())
        .map(crate::ids::shorten);
    let song = ctx.params.get("song").filter(|v| !v.is_empty());
    let genres: Vec<String> = ctx
        .params
        .all("genre")
        .into_iter()
        .filter(|g| !g.is_empty())
        .take(8)
        .map(str::to_owned)
        .collect();
    if artist.is_none() && song.is_none() && genres.is_empty() {
        return Err(ApiError::missing("artist, song or genre"));
    }
    let (albums, similar, mixes) = tokio::join!(
        async {
            match artist {
                Some(a) => similar_artist_albums(ctx, &a).await,
                None => Vec::new(),
            }
        },
        async {
            match song {
                Some(s) => list(
                    &route(ctx, "getSimilarSongs2", &[("id", s), ("count", "20")]).await,
                    "similarSongs2",
                    "song",
                ),
                None => json!([]),
            }
        },
        join_all(genres.iter().map(|genre| async move {
            let songs = route(
                ctx,
                "getRandomSongs",
                &[("genre", genre.as_str()), ("size", "30")],
            )
            .await;
            json!({ "genre": genre, "song": list(&songs, "randomSongs", "song") })
        })),
    );
    Ok(one(
        "musonicHomeMore",
        json!({ "similarArtistAlbums": albums, "similarSongs": similar, "genreMixes": mixes }),
    ))
}
