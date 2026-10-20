//! Browsing and playing a small scanned library through the Subsonic API.

use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode, header},
};
use http_body_util::BodyExt;
use serde_json::Value;
use tower::ServiceExt;

use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};

use crate::{
    library::Scanner,
    online::Deezer,
    server::{AppState, router, tests::state},
    testing::{SONG, Song, temp_dir, write_song},
};

const AUTH: &str = "u=Doodz&p=correct%20horse&f=json";

struct Lib {
    app: Router,
    st: AppState,
    root: std::path::PathBuf,
}

impl Drop for Lib {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
        let _ = std::fs::remove_dir_all(&self.st.data_dir);
    }
}

async fn library(name: &str) -> Lib {
    library_with(name, None).await
}

async fn library_with(name: &str, online: Option<Arc<Deezer>>) -> Lib {
    let root = temp_dir(&format!("lib-{name}"));
    write_song(
        &root,
        "Sigur Rós/Takk/03 - Hoppípolla.wav",
        &Song {
            cover: true,
            ..SONG
        },
    );
    write_song(
        &root,
        "Sigur Rós/Takk/01 - Takk.wav",
        &Song {
            title: "Takk...",
            track: 1,
            ..SONG
        },
    );
    write_song(
        &root,
        "Daft Punk/RAM/08 - Get Lucky.wav",
        &Song {
            title: "Get Lucky",
            artist: "Daft Punk feat. Pharrell Williams",
            album: "Random Access Memories",
            track: 8,
            genre: "Electro",
            ..SONG
        },
    );
    std::fs::write(
        root.join("Sigur Rós/Takk/03 - Hoppípolla.lrc"),
        "[00:01.00]Brosandi\n[00:02.50]Hendumst\n",
    )
    .unwrap();
    let mut st = state();
    st.data_dir = temp_dir(&format!("data-{name}"));
    st.online = online;
    st.users
        .create("Doodz", "correct horse", true)
        .await
        .unwrap();
    Scanner::new(st.db.clone(), root.clone())
        .await
        .unwrap()
        .scan(false)
        .await
        .unwrap();
    Lib {
        app: router(st.clone()),
        st,
        root,
    }
}

impl Lib {
    async fn get(&self, query: &str) -> Value {
        let (_, _, body) = self.raw(&format!("{query}&{AUTH}"), None).await;
        let v: Value = serde_json::from_slice(&body).unwrap();
        let r = v["subsonic-response"].clone();
        assert_eq!(r["status"], "ok", "{query}: {r}");
        r
    }

    async fn raw(
        &self,
        uri: &str,
        range: Option<&str>,
    ) -> (StatusCode, axum::http::HeaderMap, Vec<u8>) {
        let mut req = Request::get(format!("/rest/{uri}"));
        if let Some(r) = range {
            req = req.header(header::RANGE, r);
        }
        let res = self
            .app
            .clone()
            .oneshot(req.body(Body::empty()).unwrap())
            .await
            .unwrap();
        let (status, headers) = (res.status(), res.headers().clone());
        (
            status,
            headers,
            res.into_body().collect().await.unwrap().to_bytes().to_vec(),
        )
    }

    /// The Subsonic error code of a failing call.
    async fn error(&self, query: &str) -> i64 {
        let (_, _, body) = self.raw(&format!("{query}&{AUTH}"), None).await;
        let v: Value = serde_json::from_slice(&body).unwrap();
        let r = &v["subsonic-response"];
        assert_eq!(r["status"], "failed", "{query}: {r}");
        r["error"]["code"].as_i64().unwrap()
    }

    /// Marks the files of a track gone (or back).
    async fn set_missing(&self, track: &str, missing: bool) {
        let t = track.to_owned();
        self.st
            .db
            .call(move |c| {
                c.execute(
                    "UPDATE track_file SET missing = ?2 WHERE track_id = ?1",
                    rusqlite::params![t, missing],
                )?;
                Ok(())
            })
            .await
            .unwrap();
    }

    async fn entries(&self, playlist: &str) -> Vec<String> {
        self.get(&format!("getPlaylist?id={playlist}")).await["playlist"]["entry"]
            .as_array()
            .unwrap()
            .iter()
            .map(|e| e["id"].as_str().unwrap().to_owned())
            .collect()
    }

    async fn song_id(&self, title: &str) -> String {
        let r = self
            .get(&format!("search3?query={}", title.replace(' ', "%20")))
            .await;
        r["searchResult3"]["song"][0]["id"]
            .as_str()
            .unwrap()
            .to_owned()
    }
}

#[tokio::test]
async fn artists_albums_and_songs() {
    let lib = library("browse").await;
    let r = lib.get("getArtists?").await;
    let names: Vec<&str> = r["artists"]["index"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|i| i["artist"].as_array().unwrap())
        .map(|a| a["name"].as_str().unwrap())
        .collect();
    assert_eq!(names, ["Daft Punk", "Sigur Rós"], "album artists, sorted");

    let albums = lib
        .get("getAlbumList2?type=alphabeticalByName&size=10")
        .await;
    let takk = albums["albumList2"]["album"]
        .as_array()
        .unwrap()
        .iter()
        .find(|a| a["name"] == "Takk...")
        .unwrap()
        .clone();
    assert_eq!(takk["songCount"], 2);
    assert_eq!(takk["year"], 2005);
    assert_eq!(takk["genre"], "Post-Rock");
    assert!(takk["coverArt"].is_string());

    let album = lib
        .get(&format!("getAlbum?id={}", takk["id"].as_str().unwrap()))
        .await;
    let songs = album["album"]["song"].as_array().unwrap();
    assert_eq!(songs.len(), 2);
    assert_eq!(songs[0]["title"], "Takk...", "track order");
    let song = &songs[1];
    assert_eq!(song["title"], "Hoppípolla");
    assert_eq!(song["suffix"], "wav");
    assert_eq!(song["contentType"], "audio/wav");
    assert_eq!(song["duration"], 1);
    assert_eq!(song["track"], 3);
    assert_eq!(song["albumId"], takk["id"]);
    assert_eq!(song["artists"][0]["name"], "Sigur Rós");
    assert!(song["bitRate"].as_i64().unwrap() > 0);

    let artist = lib
        .get(&format!(
            "getArtist?id={}",
            song["artistId"].as_str().unwrap()
        ))
        .await;
    assert_eq!(artist["artist"]["album"].as_array().unwrap().len(), 1);

    let lucky = lib
        .get(&format!("getSong?id={}", lib.song_id("get lucky").await))
        .await;
    assert_eq!(lucky["song"]["artist"], "Daft Punk • Pharrell Williams");
    assert_eq!(lucky["song"]["artists"].as_array().unwrap().len(), 2);
}

#[tokio::test]
async fn lists_search_genres() {
    let lib = library("lists").await;
    let r = lib.get("search3?query=hopp%20sig").await;
    assert_eq!(
        r["searchResult3"]["song"].as_array().unwrap().len(),
        1,
        "prefix words, accents ignored"
    );
    let r = lib.get("search3?query=").await;
    assert_eq!(
        r["searchResult3"]["song"].as_array().unwrap().len(),
        3,
        "empty query lists all"
    );
    assert_eq!(r["searchResult3"]["album"].as_array().unwrap().len(), 2);

    let r = lib.get("getGenres?").await;
    assert_eq!(r["genres"]["genre"].as_array().unwrap().len(), 2);
    let r = lib.get("getAlbumList2?type=byGenre&genre=electro").await;
    assert_eq!(
        r["albumList2"]["album"][0]["name"],
        "Random Access Memories"
    );
    let r = lib
        .get("getAlbumList2?type=byYear&fromYear=2000&toYear=2009")
        .await;
    assert_eq!(r["albumList2"]["album"].as_array().unwrap().len(), 2);
    let r = lib
        .get("getAlbumList2?type=byYear&fromYear=1990&toYear=1999")
        .await;
    assert!(r["albumList2"]["album"].as_array().unwrap().is_empty());
    let r = lib.get("getRandomSongs?size=2").await;
    assert_eq!(r["randomSongs"]["song"].as_array().unwrap().len(), 2);
    let r = lib.get("getSongsByGenre?genre=Post-Rock").await;
    assert_eq!(r["songsByGenre"]["song"].as_array().unwrap().len(), 2);
    let r = lib.get("getTopSongs?artist=Sigur%20R%C3%B3s").await;
    assert_eq!(r["topSongs"]["song"].as_array().unwrap().len(), 2);
    let r = lib.get("getScanStatus?").await;
    assert_eq!(r["scanStatus"]["count"], 3);
    assert_eq!(
        lib.get("getIndexes?").await["indexes"]["index"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
}

#[tokio::test]
async fn likes_and_playlists_are_read_per_user() {
    let lib = library("likes").await;
    let id = lib.song_id("hoppipolla").await;
    let user = lib.st.users.list().await.unwrap()[0].id.clone();
    let (u, t) = (user.clone(), id.clone());
    lib.st
        .db
        .call(move |c| {
            c.execute("INSERT INTO annotation(user_id, item_type, item_id, starred_at, play_count) VALUES (?1, 'track', ?2, 1760000000, 4)", [&u, &t])?;
            c.execute("INSERT INTO playlist(id, owner_id, name) VALUES ('p1', ?1, 'Mix')", [&u])?;
            for (pos, track) in [(0, &t), (1, &t)] {
                c.execute("INSERT INTO playlist_track(playlist_id, position, track_id) VALUES ('p1', ?1, ?2)", rusqlite::params![pos, track])?;
            }
            Ok(())
        })
        .await
        .unwrap();
    let r = lib.get("getStarred2?").await;
    assert_eq!(r["starred2"]["song"][0]["id"], id.as_str());
    assert_eq!(r["starred2"]["song"][0]["playCount"], 4);
    assert!(
        r["starred2"]["song"][0]["starred"]
            .as_str()
            .unwrap()
            .starts_with("2025-10-09T")
    );
    let r = lib.get("getPlaylist?id=p1").await;
    assert_eq!(
        r["playlist"]["entry"].as_array().unwrap().len(),
        2,
        "a song listed twice stays twice"
    );
    assert_eq!(r["playlist"]["songCount"], 2);
    assert_eq!(
        lib.get("getPlaylists?").await["playlists"]["playlist"][0]["name"],
        "Mix"
    );
}

#[tokio::test]
async fn streams_with_ranges_and_downloads() {
    let lib = library("stream").await;
    let id = lib.song_id("hoppipolla").await;
    let (status, h, body) = lib.raw(&format!("stream?id={id}&{AUTH}"), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(h[header::CONTENT_TYPE], "audio/wav");
    assert_eq!(h[header::ACCEPT_RANGES], "bytes");
    assert_eq!(&body[..4], b"RIFF", "the file as is");
    let size = body.len();

    let (status, h, part) = lib
        .raw(&format!("stream?id={id}&{AUTH}"), Some("bytes=10-19"))
        .await;
    assert_eq!(status, StatusCode::PARTIAL_CONTENT);
    assert_eq!(
        h[header::CONTENT_RANGE],
        format!("bytes 10-19/{size}").as_str()
    );
    assert_eq!(part, body[10..20]);
    let (status, ..) = lib
        .raw(
            &format!("stream?id={id}&{AUTH}"),
            Some(&format!("bytes={size}-")),
        )
        .await;
    assert_eq!(status, StatusCode::RANGE_NOT_SATISFIABLE);

    let (_, h, _) = lib.raw(&format!("download?id={id}&{AUTH}"), None).await;
    assert!(
        h[header::CONTENT_DISPOSITION]
            .to_str()
            .unwrap()
            .contains("Hopp")
    );

    let (_, _, err) = lib.raw(&format!("stream?id=nope&{AUTH}"), None).await;
    assert!(String::from_utf8_lossy(&err).contains("\"code\":70"));
}

#[tokio::test]
async fn transcodes_when_a_lower_bit_rate_is_asked() {
    let lib = library("transcode").await;
    let id = lib.song_id("hoppipolla").await;
    let (status, h, body) = lib
        .raw(&format!("stream?id={id}&maxBitRate=64&{AUTH}"), None)
        .await;
    assert_eq!(status, StatusCode::OK);
    let has_ffmpeg = std::process::Command::new("ffmpeg")
        .arg("-version")
        .output()
        .is_ok();
    if has_ffmpeg {
        assert_eq!(h[header::CONTENT_TYPE], "audio/mpeg");
        // ffmpeg starts MP3 streams with an empty ID3 header, then MPEG frames.
        assert!(
            body.len() > 1000 && body.windows(2).any(|w| w[0] == 0xFF && w[1] & 0xE0 == 0xE0),
            "MPEG frames"
        );
    } else {
        assert_eq!(
            h[header::CONTENT_TYPE],
            "audio/wav",
            "no ffmpeg: the file as is"
        );
    }
}

#[tokio::test]
async fn covers_and_lyrics() {
    let lib = library("covers").await;
    let id = lib.song_id("hoppipolla").await;
    let song = lib.get(&format!("getSong?id={id}")).await;
    let cover = song["song"]["coverArt"].as_str().unwrap().to_owned();

    let (status, h, full) = lib
        .raw(&format!("getCoverArt?id={cover}&{AUTH}"), None)
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(h[header::CONTENT_TYPE], "image/png");
    let (_, h, small) = lib
        .raw(&format!("getCoverArt?id={cover}&size=32&{AUTH}"), None)
        .await;
    assert_eq!(h[header::CONTENT_TYPE], "image/jpeg");
    let img = image::load_from_memory(&small).unwrap();
    assert_eq!((img.width(), img.height()), (32, 24));
    assert_ne!(full, small);
    // From the cache the second time, same bytes.
    let (_, _, again) = lib
        .raw(&format!("getCoverArt?id={cover}&size=32&{AUTH}"), None)
        .await;
    assert_eq!(again, small);
    let (status, ..) = lib.raw(&format!("getCoverArt?id=nope&{AUTH}"), None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let r = lib.get(&format!("getLyricsBySongId?id={id}")).await;
    let l = &r["lyricsList"]["structuredLyrics"][0];
    assert_eq!(l["synced"], true);
    assert_eq!(l["line"][1]["start"], 2500);
    assert_eq!(l["line"][1]["value"], "Hendumst");
    let r = lib
        .get("getLyrics?artist=Sigur%20Ros&title=Hoppipolla")
        .await;
    assert_eq!(r["lyrics"]["value"], "Brosandi\nHendumst");
    let r = lib
        .get(&format!(
            "getLyricsBySongId?id={}",
            lib.song_id("get lucky").await
        ))
        .await;
    assert!(
        r["lyricsList"]["structuredLyrics"]
            .as_array()
            .unwrap()
            .is_empty()
    );
}

#[tokio::test]
async fn likes_ratings_and_plays_are_saved() {
    let lib = library("annotate").await;
    let id = lib.song_id("hoppipolla").await;
    let song = lib.get(&format!("getSong?id={id}")).await["song"].clone();
    let (album, artist) = (
        song["albumId"].as_str().unwrap().to_owned(),
        song["artistId"].as_str().unwrap().to_owned(),
    );

    lib.get(&format!("star?id={id}&albumId={album}&artistId={artist}"))
        .await;
    let r = lib.get("getStarred2?").await;
    assert_eq!(r["starred2"]["song"][0]["id"], id.as_str());
    assert_eq!(r["starred2"]["album"][0]["id"], album.as_str());
    assert_eq!(r["starred2"]["artist"][0]["id"], artist.as_str());
    lib.get(&format!("unstar?id={id}")).await;
    let r = lib.get("getStarred2?").await;
    assert!(r["starred2"]["song"].as_array().unwrap().is_empty());
    assert_eq!(r["starred2"]["album"].as_array().unwrap().len(), 1);
    assert_eq!(lib.error("star?id=nope").await, 70);
    assert_eq!(
        lib.error(&format!("star?albumId={id}")).await,
        70,
        "a song is not an album"
    );
    assert_eq!(lib.error("star?").await, 10);

    lib.get(&format!("setRating?id={id}&rating=4")).await;
    assert_eq!(
        lib.get(&format!("getSong?id={id}")).await["song"]["userRating"],
        4
    );
    lib.get(&format!("setRating?id={id}&rating=0")).await;
    assert!(lib.get(&format!("getSong?id={id}")).await["song"]["userRating"].is_null());
    assert_eq!(lib.error(&format!("setRating?id={id}&rating=9")).await, 0);

    // Two plays, the second one dated.
    lib.get(&format!("scrobble.view?id={id}&submission=true"))
        .await;
    lib.get(&format!("scrobble?id={id}&time=1760905800000&c=web"))
        .await;
    let s = lib.get(&format!("getSong?id={id}")).await["song"].clone();
    assert_eq!(s["playCount"], 2);
    assert!(
        s["played"].as_str().unwrap() > "2025-10-19T20:30:00Z",
        "keeps the latest"
    );
    assert_eq!(
        lib.get(&format!("getAlbum?id={album}")).await["album"]["playCount"],
        2
    );
    let r = lib.get("getAlbumList2?type=frequent").await;
    assert_eq!(r["albumList2"]["album"][0]["id"], album.as_str());
    let r = lib
        .get(&format!("getTopSongs?artist={}", "Sigur%20R%C3%B3s"))
        .await;
    assert_eq!(r["topSongs"]["song"][0]["id"], id.as_str());
    assert_eq!(lib.error("scrobble?id=nope").await, 70);

    assert!(
        lib.get("getNowPlaying?").await["nowPlaying"]["entry"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    lib.get(&format!("scrobble?id={id}&submission=false&c=Musonic"))
        .await;
    let r = lib.get("getNowPlaying?").await;
    let e = &r["nowPlaying"]["entry"][0];
    assert_eq!(e["id"], id.as_str());
    assert_eq!(e["username"], "Doodz");
    assert_eq!(e["playerName"], "Musonic");
    assert_eq!(e["minutesAgo"], 0);
    assert_eq!(
        lib.get(&format!("getSong?id={id}")).await["song"]["playCount"],
        2,
        "now playing is not a play"
    );
}

#[tokio::test]
async fn playlists_are_edited_by_the_positions_clients_see() {
    let lib = library("edit").await;
    let a = lib.song_id("hoppipolla").await;
    let b = lib.song_id("takk").await;
    let c = lib.song_id("lucky").await;

    let r = lib
        .get(&format!(
            "createPlaylist?name=Road%20trip&songId={a}&songId={b}&songId={c}"
        ))
        .await;
    let pl = r["playlist"]["id"].as_str().unwrap().to_owned();
    assert_eq!(r["playlist"]["name"], "Road trip");
    assert_eq!(r["playlist"]["entry"].as_array().unwrap().len(), 3);
    assert_eq!(lib.error("createPlaylist?").await, 10);
    assert_eq!(lib.error("createPlaylist?name=X&songId=nope").await, 70);

    // b's file goes away: the client sees [a, c] and removes its 2nd song, c.
    lib.set_missing(&b, true).await;
    assert_eq!(lib.entries(&pl).await, [a.clone(), c.clone()]);
    let r = lib.get(&format!("getPlaylist?id={pl}")).await;
    assert_eq!(r["playlist"]["songCount"], 2, "counts what is shown");
    lib.get(&format!(
        "updatePlaylist?playlistId={pl}&songIndexToRemove=1&songIdToAdd={a}"
    ))
    .await;
    lib.set_missing(&b, false).await;
    assert_eq!(lib.entries(&pl).await, [a.clone(), b.clone(), a.clone()]);

    // Reordering (all songs sent again) keeps the hidden one after its song.
    lib.set_missing(&b, true).await;
    lib.get(&format!(
        "createPlaylist?playlistId={pl}&songId={c}&songId={a}"
    ))
    .await;
    lib.set_missing(&b, false).await;
    assert_eq!(lib.entries(&pl).await, [c.clone(), a.clone(), b.clone()]);

    lib.get(&format!(
        "updatePlaylist?playlistId={pl}&name=Summer&comment=Hot&public=true"
    ))
    .await;
    let r = lib.get(&format!("getPlaylist?id={pl}")).await;
    assert_eq!(r["playlist"]["name"], "Summer");
    assert_eq!(r["playlist"]["comment"], "Hot");
    assert_eq!(r["playlist"]["public"], true);

    // Someone else sees a public playlist but cannot change it.
    lib.st
        .users
        .create("Other", "other password", false)
        .await
        .unwrap();
    let other = |q: &str| format!("{q}&u=Other&p=other%20password&f=json");
    let (_, _, body) = lib
        .raw(&other(&format!("deletePlaylist?id={pl}")), None)
        .await;
    let v: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(v["subsonic-response"]["error"]["code"], 50);
    let (_, _, body) = lib.raw(&other(&format!("getPlaylist?id={pl}")), None).await;
    let v: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(v["subsonic-response"]["status"], "ok");

    lib.get(&format!("deletePlaylist?id={pl}")).await;
    assert_eq!(lib.error(&format!("getPlaylist?id={pl}")).await, 70);
    assert_eq!(
        lib.error(&format!("updatePlaylist?playlistId={pl}&name=X"))
            .await,
        70
    );
}

#[tokio::test]
async fn play_queue_is_saved_and_restored() {
    let lib = library("queue").await;
    let a = lib.song_id("hoppipolla").await;
    let b = lib.song_id("takk").await;
    let c = lib.song_id("lucky").await;

    assert!(lib.get("getPlayQueue?").await.get("playQueue").is_none());
    lib.get(&format!(
        "savePlayQueue?id={a}&id=nope&id={b}&id={c}&current={b}&position=1234&c=web"
    ))
    .await;
    let r = lib.get("getPlayQueue?").await;
    let q = &r["playQueue"];
    assert_eq!(q["current"], b.as_str());
    assert_eq!(q["position"], 1234);
    assert_eq!(q["username"], "Doodz");
    assert_eq!(q["changedBy"], "web");
    assert_eq!(
        q["entry"].as_array().unwrap().len(),
        3,
        "unknown ids left out"
    );

    lib.get(&format!(
        "savePlayQueueByIndex?id={a}&id={b}&id={c}&currentIndex=2"
    ))
    .await;
    assert_eq!(
        lib.get("getPlayQueueByIndex?").await["playQueue"]["currentIndex"],
        2
    );
    // The current song without a file: the next one shown.
    lib.get(&format!(
        "savePlayQueueByIndex?id={a}&id={b}&id={c}&currentIndex=1"
    ))
    .await;
    lib.set_missing(&b, true).await;
    let r = lib.get("getPlayQueue?").await;
    assert_eq!(r["playQueue"]["current"], c.as_str());
    assert_eq!(r["playQueue"]["entry"].as_array().unwrap().len(), 2);

    lib.get("savePlayQueue?").await;
    assert!(lib.get("getPlayQueue?").await.get("playQueue").is_none());
}

// Online catalog -------------------------------------------------------------------------

/// A local stand-in for Deezer's public API; counts the requests it answers.
async fn fake_deezer() -> (Arc<Deezer>, Arc<AtomicUsize>) {
    use axum::{extract::Path as P, routing::get};
    use serde_json::json;
    let hits = Arc::new(AtomicUsize::new(0));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let artist =
        json!({ "id": 27, "name": "Daft Punk", "picture_xl": format!("{base}/img/27.png") });
    let album = json!({ "id": 302127, "title": "Discovery", "cover_xl": format!("{base}/img/302127.png"),
                        "release_date": "2001-03-07", "artist": artist.clone() });
    let track = |id: u64, title: &str, pos: i64| {
        json!({ "id": id, "title": title, "duration": 320, "track_position": pos, "disk_number": 1,
                "isrc": format!("GBDUW00000{id}"), "artist": artist.clone(), "album": album.clone() })
    };
    let one = track(1001, "One More Time", 1);
    let two = track(1002, "Aerodynamic", 2);
    let hoppipolla = json!({ "id": 2001, "title": "Hoppípolla", "duration": 268,
        "artist": { "id": 9, "name": "Sigur Rós" }, "album": { "id": 9001, "title": "Takk..." } });
    let full_album = {
        let mut a = album.clone();
        a["tracks"] = json!({ "data": [one.clone(), two.clone()] });
        a["genres"] = json!({ "data": [{ "name": "Electro" }] });
        a
    };
    let h = hits.clone();
    let app = axum::Router::new()
        .route(
            "/search/track",
            get({
                let (one, hoppipolla) = (one.clone(), hoppipolla.clone());
                move || async move { axum::Json(json!({ "data": [one, hoppipolla] })) }
            }),
        )
        .route(
            "/search/album",
            get({
                let album = album.clone();
                move || async move { axum::Json(json!({ "data": [album] })) }
            }),
        )
        .route(
            "/search/artist",
            get({
                let artist = artist.clone();
                move || async move { axum::Json(json!({ "data": [artist] })) }
            }),
        )
        .route(
            "/track/{id}",
            get(move |P(id): P<u64>| {
                let found = [one.clone(), two.clone()]
                    .into_iter()
                    .find(|t| t["id"] == id);
                async move {
                    axum::Json(found.unwrap_or_else(
                        || json!({ "error": { "code": 800, "message": "no data" } }),
                    ))
                }
            }),
        )
        .route(
            "/album/{id}",
            get(move || async move { axum::Json(full_album) }),
        )
        .route(
            "/artist/{id}",
            get({
                let artist = artist.clone();
                move || async move { axum::Json(artist) }
            }),
        )
        .route(
            "/artist/{id}/albums",
            get(move || async move {
                let mut a = album.clone();
                a.as_object_mut().unwrap().remove("artist");
                axum::Json(json!({ "data": [a] }))
            }),
        )
        .route("/img/{name}", get(|| async { crate::testing::png() }))
        .layer(axum::middleware::from_fn(
            move |req, next: axum::middleware::Next| {
                h.fetch_add(1, Ordering::SeqCst);
                async move { next.run(req).await }
            },
        ));
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (Arc::new(Deezer::new(&base).unwrap()), hits)
}

#[tokio::test]
async fn online_search_and_pages() {
    let (dz, hits) = fake_deezer().await;
    let lib = library_with("online-browse", Some(dz)).await;

    let r = lib.get("search3?query=one%20more").await;
    let res = &r["searchResult3"];
    assert_eq!(res["song"][0]["id"], "dz-track-1001");
    assert_eq!(res["song"][0]["albumId"], "dz-album-302127");
    assert_eq!(res["album"][0]["id"], "dz-album-302127");
    assert_eq!(res["artist"][0]["id"], "dz-artist-27");
    // A song of the library is not shown twice.
    let r = lib.get("search3?query=hoppipolla").await;
    let titles: Vec<&str> = r["searchResult3"]["song"]
        .as_array()
        .unwrap()
        .iter()
        .map(|s| s["id"].as_str().unwrap())
        .collect();
    assert_eq!(
        titles.len(),
        2,
        "{titles:?}: the local one, then One More Time"
    );
    assert!(!titles[0].starts_with("dz-"));
    // Later pages: the library only.
    let r = lib.get("search3?query=one%20more&songOffset=20").await;
    assert!(r["searchResult3"]["song"].as_array().unwrap().is_empty());

    let r = lib.get("getSong?id=dz-track-1001").await;
    assert_eq!(r["song"]["title"], "One More Time");
    let r = lib.get("getAlbum?id=dz-album-302127").await;
    assert_eq!(r["album"]["name"], "Discovery");
    assert_eq!(r["album"]["song"].as_array().unwrap().len(), 2);
    assert_eq!(r["album"]["song"][1]["track"], 2);
    let r = lib.get("getArtist?id=dz-artist-27").await;
    assert_eq!(r["artist"]["album"][0]["artistId"], "dz-artist-27");

    let before = hits.load(Ordering::SeqCst);
    lib.get("getAlbum?id=dz-album-302127").await;
    assert_eq!(hits.load(Ordering::SeqCst), before, "answers are cached");

    let (status, _, body) = lib
        .raw(
            &format!("getCoverArt?id=dz-album-302127&size=1&{AUTH}"),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    assert!(!body.is_empty());
    assert_eq!(lib.error("getSong?id=dz-track-9").await, 70);
    assert!(
        lib.get("getAlbumList2?type=newest").await["albumList2"]["album"]
            .as_array()
            .unwrap()
            .iter()
            .all(|a| a["name"] != "Discovery"),
        "browsing stores nothing"
    );
}

#[tokio::test]
async fn online_songs_are_liked_and_added_at_once() {
    let (dz, _) = fake_deezer().await;
    let lib = library_with("online-use", Some(dz)).await;

    lib.get("star?id=dz-track-1001").await;
    let r = lib.get("getStarred2?").await;
    let song = r["starred2"]["song"][0].clone();
    let id = song["id"].as_str().unwrap().to_owned();
    assert!(!id.starts_with("dz-"), "stored under a library id: {id}");
    assert_eq!(song["title"], "One More Time");
    assert!(song["starred"].is_string());
    // Liking it again finds the same track.
    lib.get("star?id=dz-track-1001").await;
    assert_eq!(
        lib.get("getStarred2?").await["starred2"]["song"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    // Its album and artist open (online pages under the library ids), with its cover.
    let album = song["albumId"].as_str().unwrap();
    let r = lib.get(&format!("getAlbum?id={album}")).await;
    assert_eq!(r["album"]["id"], album);
    assert_eq!(
        r["album"]["song"][0]["id"],
        id.as_str(),
        "the stored song shows as such"
    );
    assert_eq!(r["album"]["song"][1]["id"], "dz-track-1002");
    let artist = song["artistId"].as_str().unwrap();
    assert_eq!(
        lib.get(&format!("getArtist?id={artist}")).await["artist"]["name"],
        "Daft Punk"
    );
    let (status, _, _) = lib
        .raw(
            &format!(
                "getCoverArt?id={}&{AUTH}",
                song["coverArt"].as_str().unwrap()
            ),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);

    // Added to a playlist, played, queued: same id.
    let r = lib
        .get("createPlaylist?name=Online&songId=dz-track-1002&songId=dz-track-1001")
        .await;
    let entries = r["playlist"]["entry"].as_array().unwrap();
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[1]["id"], id.as_str());
    assert_eq!(r["playlist"]["songCount"], 2);
    lib.get("scrobble?id=dz-track-1001").await;
    assert_eq!(
        lib.get(&format!("getSong?id={id}")).await["song"]["playCount"],
        1
    );
    lib.get("savePlayQueue?id=dz-track-1001&current=dz-track-1001")
        .await;
    assert_eq!(
        lib.get("getPlayQueue?").await["playQueue"]["current"],
        id.as_str()
    );

    // Not part of the library lists until imported.
    let r = lib.get("getRandomSongs?size=50").await;
    assert!(
        r["randomSongs"]["song"]
            .as_array()
            .unwrap()
            .iter()
            .all(|s| s["title"] != "One More Time")
    );
    assert_eq!(lib.error("star?id=dz-track-9").await, 70);
}

#[tokio::test]
async fn without_the_online_catalog_online_ids_are_unknown() {
    let lib = library("offline").await;
    assert_eq!(lib.error("star?id=dz-track-1001").await, 70);
    assert_eq!(lib.error("getAlbum?id=dz-album-1").await, 70);
    let r = lib.get("search3?query=hoppipolla").await;
    assert_eq!(r["searchResult3"]["song"].as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn an_online_song_keeps_its_likes_and_playlists_once_imported() {
    let (dz, _) = fake_deezer().await;
    let lib = library_with("online-import", Some(dz)).await;
    lib.get("star?id=dz-track-1001").await;
    let r = lib
        .get("createPlaylist?name=Mix&songId=dz-track-1001")
        .await;
    let pl = r["playlist"]["id"].as_str().unwrap().to_owned();
    let id = lib.get("getStarred2?").await["starred2"]["song"][0]["id"]
        .as_str()
        .unwrap()
        .to_owned();

    // The file arrives with the tags the import writes.
    write_song(
        &lib.root,
        "Musonic/Daft Punk/Discovery/01 - One More Time.wav",
        &Song {
            title: "One More Time",
            artist: "Daft Punk",
            album: "Discovery",
            track: 1,
            genre: "Electro",
            ..SONG
        },
    );
    Scanner::new(lib.st.db.clone(), lib.root.clone())
        .await
        .unwrap()
        .scan(false)
        .await
        .unwrap();

    let song = lib.get("getStarred2?").await["starred2"]["song"][0].clone();
    assert_eq!(song["id"], id.as_str(), "same track, still liked");
    assert!(
        song["path"]
            .as_str()
            .unwrap()
            .ends_with("One More Time.wav")
    );
    assert_eq!(lib.entries(&pl).await, std::slice::from_ref(&id));
    let r = lib.get("getRandomSongs?size=50").await;
    assert!(
        r["randomSongs"]["song"]
            .as_array()
            .unwrap()
            .iter()
            .any(|s| s["id"] == id.as_str()),
        "now part of the library"
    );
}
