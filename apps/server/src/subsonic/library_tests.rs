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

    async fn raw_with(
        &self,
        uri: &str,
        headers: &[(header::HeaderName, &str)],
    ) -> (StatusCode, axum::http::HeaderMap, Vec<u8>) {
        let mut req = Request::get(format!("/rest/{uri}"));
        for (k, v) in headers {
            req = req.header(k, *v);
        }
        let res = self
            .app
            .clone()
            .oneshot(req.body(Body::empty()).unwrap())
            .await
            .unwrap();
        let (status, h) = (res.status(), res.headers().clone());
        (
            status,
            h,
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
    let page = |r: &Value| -> Vec<(String, i64)> {
        r["albumList2"]["album"]
            .as_array()
            .unwrap()
            .iter()
            .map(|a| {
                (
                    a["name"].as_str().unwrap().to_owned(),
                    a["songCount"].as_i64().unwrap(),
                )
            })
            .collect()
    };
    let all = page(&lib.get("getAlbumList2?type=alphabeticalByName").await);
    assert_eq!(all.len(), 2);
    let second = page(
        &lib.get("getAlbumList2?type=alphabeticalByName&size=1&offset=1")
            .await,
    );
    assert_eq!(second, all[1..], "page, order and song count kept");
    let r = lib.get("getRandomSongs?size=2").await;
    assert_eq!(r["randomSongs"]["song"].as_array().unwrap().len(), 2);
    let r = lib.get("getRandomSongs?size=50").await;
    assert_eq!(r["randomSongs"]["song"].as_array().unwrap().len(), 3);
    let r = lib
        .get("getRandomSongs?size=50&fromYear=1990&toYear=1999")
        .await;
    assert!(r["randomSongs"]["song"].as_array().unwrap().is_empty());
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
        // Kept once made: the same song again is a file, with its length and ranges.
        let uri = format!("stream?id={id}&maxBitRate=64&{AUTH}");
        let mut again = None;
        for _ in 0..50 {
            let r = lib.raw(&uri, None).await;
            if r.1.contains_key(header::CONTENT_LENGTH) {
                again = Some(r);
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
        let (status, h, kept) = again.expect("kept after the first play");
        assert_eq!(status, StatusCode::OK);
        assert_eq!(h[header::ACCEPT_RANGES], "bytes");
        assert_eq!(kept, body, "the same bytes");
        let (status, _, part) = lib.raw(&uri, Some("bytes=100-199")).await;
        assert_eq!(status, StatusCode::PARTIAL_CONTENT);
        assert_eq!(part, body[100..200]);
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
    // From the cache the second time: the same picture, or its smaller version once made.
    let (_, _, again) = lib
        .raw(&format!("getCoverArt?id={cover}&size=32&{AUTH}"), None)
        .await;
    let img = image::load_from_memory(&again).unwrap();
    assert_eq!((img.width(), img.height()), (32, 24));
    assert!(again.len() <= small.len());
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
                "isrc": format!("GBDUW00000{id}"), "artist": artist.clone(), "album": album.clone(),
                "preview": format!("{base}/preview/{id}.mp3") })
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
        // No ranges here: the whole preview is read once.
        .route("/preview/{name}", get(|| async { audio(40_000, 7) }))
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

// Tracks without a file ------------------------------------------------------------------

/// `len` bytes that differ at every offset (to catch any misplaced range).
fn audio(len: usize, seed: u8) -> Vec<u8> {
    (0..len).map(|i| (i % 251) as u8 ^ seed).collect()
}

/// A track known only through a provider of the "memory" catalog.
async fn remote_track(lib: &Lib, provider_id: &str) -> String {
    let p = provider_id.to_owned();
    lib.st
        .db
        .call(move |c| {
            c.execute(
                "INSERT INTO track(id, title, norm_title, duration_ms) VALUES ('remote', 'Remote', 'remote', 200000)",
                [],
            )?;
            c.execute(
                "INSERT INTO track_source(provider, provider_id, track_id) VALUES ('memory', ?1, 'remote')",
                [&p],
            )?;
            Ok(())
        })
        .await
        .unwrap();
    "remote".into()
}

async fn get_range(
    lib: &Lib,
    id: &str,
    range: Option<&str>,
) -> (StatusCode, axum::http::HeaderMap, Vec<u8>) {
    lib.raw(&format!("stream?id={id}&{AUTH}"), range).await
}

#[tokio::test]
async fn songs_without_a_file_play_from_providers_with_ranges() {
    use crate::providers::{AudioFormat, MemoryProvider, Quality};
    let data = audio(2 * 1024 * 1024 + 300, 1);
    let mut lib = library("remote-stream").await;
    lib.st.providers = Arc::new(vec![Arc::new(MemoryProvider::default().with(
        "m1",
        data.clone(),
        AudioFormat::Mp3,
        Quality::Mp3_128,
    ))]);
    lib.app = router(lib.st.clone());
    let id = remote_track(&lib, "m1").await;

    let (status, headers, body) = get_range(&lib, &id, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(headers[header::CONTENT_TYPE], "audio/mpeg");
    assert_eq!(body, data);
    // Across the first segment boundary, then the end.
    let (status, headers, body) = get_range(&lib, &id, Some("bytes=1048570-1048590")).await;
    assert_eq!(status, StatusCode::PARTIAL_CONTENT);
    assert_eq!(
        headers[header::CONTENT_RANGE],
        format!("bytes 1048570-1048590/{}", data.len()).as_str()
    );
    assert_eq!(body, data[1048570..=1048590]);
    let (_, _, body) = get_range(&lib, &id, Some("bytes=-10")).await;
    assert_eq!(body, data[data.len() - 10..]);
    let (status, _, _) = get_range(&lib, &id, Some("bytes=99999999-")).await;
    assert_eq!(status, StatusCode::RANGE_NOT_SATISFIABLE);
    assert_eq!(lib.st.sessions.count().await, 1, "one shared stream");

    // A track no provider has.
    lib.st.providers = Arc::default();
    lib.app = router(lib.st.clone());
    lib.st
        .db
        .call(|c| {
            c.execute(
                "INSERT INTO track(id, title, norm_title) VALUES ('nowhere', 'Nowhere', 'nowhere')",
                [],
            )?;
            Ok(())
        })
        .await
        .unwrap();
    let (_, _, body) = get_range(&lib, "nowhere", None).await;
    let v: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(v["subsonic-response"]["error"]["code"], 70);
}

#[tokio::test]
async fn online_songs_play_their_preview_when_nothing_else_has_them() {
    let (dz, _) = fake_deezer().await;
    let mut lib = library_with("preview", Some(dz.clone())).await;
    lib.st.providers = Arc::new(vec![Arc::new(crate::providers::DeezerPreview::new(dz))]);
    lib.app = router(lib.st.clone());
    let (status, _, body) = get_range(&lib, "dz-track-1001", None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, audio(40_000, 7));
    let (status, _, body) = get_range(&lib, "dz-track-1001", Some("bytes=100-199")).await;
    assert_eq!(status, StatusCode::PARTIAL_CONTENT);
    assert_eq!(body, audio(40_000, 7)[100..200]);
    // Playing it stored it: it is now a library track.
    let r = lib.get("search3?query=one%20more").await;
    assert!(
        !r["searchResult3"]["song"][0]["id"]
            .as_str()
            .unwrap()
            .starts_with("dz-")
    );
}

/// A Subsonic server holding one song, answering ranges like Navidrome.
async fn fake_subsonic() -> String {
    use axum::{extract::Query, http::HeaderMap, response::IntoResponse, routing::get};
    use serde_json::json;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let data = audio(1_500_000, 3);
    let app = axum::Router::new()
        .route(
            "/rest/search3",
            get(|Query(q): Query<std::collections::HashMap<String, String>>| async move {
                let ok = q.get("u").map(String::as_str) == Some("relay") && q.contains_key("t");
                axum::Json(json!({ "subsonic-response": { "status": if ok { "ok" } else { "failed" },
                    "searchResult3": { "song": [
                        { "id": "ext-deezer-song-1002", "title": "Aerodynamic", "artist": "Daft Punk",
                          "duration": 321, "suffix": "mp3", "bitRate": 320 }
                    ] } } }))
            }),
        )
        .route(
            "/rest/stream",
            get(move |Query(q): Query<std::collections::HashMap<String, String>>, headers: HeaderMap| {
                let data = data.clone();
                async move {
                    if q.get("id").map(String::as_str) != Some("ext-deezer-song-1002") {
                        return axum::Json(json!({ "subsonic-response": { "status": "failed" } })).into_response();
                    }
                    let size = data.len();
                    let range = headers
                        .get("range")
                        .and_then(|v| v.to_str().ok())
                        .and_then(|v| v.strip_prefix("bytes="))
                        .and_then(|v| v.split_once('-'))
                        .and_then(|(a, b)| Some((a.parse::<usize>().ok()?, b.parse::<usize>().ok()?)));
                    match range {
                        Some((a, b)) => (
                            StatusCode::PARTIAL_CONTENT,
                            [("content-range", format!("bytes {a}-{b}/{size}")), ("content-type", "audio/mpeg".into())],
                            data[a..=b].to_vec(),
                        )
                            .into_response(),
                        None => ([("content-type", "audio/mpeg")], data).into_response(),
                    }
                }
            }),
        );
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    base
}

#[tokio::test]
async fn the_subsonic_relay_passes_the_conformance_checks() {
    use crate::providers::{SubsonicProvider, TrackQuery, conformance};
    let p = SubsonicProvider::new(&fake_subsonic().await, "relay", "secret").unwrap();
    let known = TrackQuery {
        title: "Aerodynamic".into(),
        artists: vec!["Daft Punk".into()],
        duration: 320,
        ..Default::default()
    };
    let unknown = TrackQuery {
        title: "Robot Rock".into(),
        artists: vec!["Daft Punk".into()],
        ..Default::default()
    };
    let report = conformance::check(&p, &known, &unknown).await.unwrap();
    assert!(report.passed(), "{report}");
}

#[tokio::test]
async fn online_songs_play_from_the_subsonic_relay_before_previews() {
    let (dz, _) = fake_deezer().await;
    let mut lib = library_with("relay", Some(dz.clone())).await;
    lib.st.providers = Arc::new(vec![
        Arc::new(
            crate::providers::SubsonicProvider::new(&fake_subsonic().await, "relay", "secret")
                .unwrap(),
        ),
        Arc::new(crate::providers::DeezerPreview::new(dz)),
    ]);
    lib.app = router(lib.st.clone());
    let (status, _, body) = get_range(&lib, "dz-track-1002", Some("bytes=0-9")).await;
    assert_eq!(status, StatusCode::PARTIAL_CONTENT);
    assert_eq!(
        body,
        audio(1_500_000, 3)[..10],
        "the full song, not the preview"
    );
    // One More Time is not on the relay: its preview.
    let (_, _, body) = get_range(&lib, "dz-track-1001", None).await;
    assert_eq!(body.len(), 40_000);
}

// Imports ---------------------------------------------------------------------------------

/// Serves a WAV file for any Deezer track, or fails as told.
struct DeezerFiles {
    fail: Option<&'static str>,
}

#[async_trait::async_trait]
impl crate::providers::AudioProvider for DeezerFiles {
    fn id(&self) -> &'static str {
        "deezer-files"
    }

    fn namespace(&self) -> Option<&'static str> {
        Some("deezer")
    }

    async fn open(
        &self,
        track: &crate::providers::TrackQuery,
        _wanted: crate::providers::Quality,
    ) -> anyhow::Result<Option<crate::providers::RemoteAudio>> {
        match self.fail {
            Some("expired") => Err(crate::providers::CredentialsExpired("ARL".into()).into()),
            Some(_) => Ok(None),
            None if track.provider_id.is_some() => {
                crate::providers::MemoryProvider::default()
                    .with(
                        "x",
                        crate::testing::wav(),
                        crate::providers::AudioFormat::Mp3,
                        crate::providers::Quality::Mp3_320,
                    )
                    .open(
                        &crate::providers::TrackQuery {
                            provider_id: Some("x".into()),
                            ..Default::default()
                        },
                        crate::providers::Quality::Flac,
                    )
                    .await
            }
            None => Ok(None),
        }
    }
}

async fn importing(
    name: &str,
    fail: Option<&'static str>,
) -> (Lib, Arc<crate::library::import::Importer>) {
    let (dz, _) = fake_deezer().await;
    let mut lib = library_with(name, Some(dz.clone())).await;
    lib.st.providers = Arc::new(vec![
        Arc::new(DeezerFiles { fail }),
        Arc::new(crate::providers::DeezerPreview::new(dz)),
    ]);
    lib.st.imports = Some(crate::library::import::ImportService::idle());
    lib.app = router(lib.st.clone());
    let importer = Arc::new(crate::library::import::Importer {
        db: lib.st.db.clone(),
        remote: lib.st.remote(),
        root: lib.root.clone(),
        dir: "Musonic".into(),
        quality: crate::providers::Quality::Mp3_320,
        library: None,
        http: reqwest::Client::new(),
        events: Some(lib.st.events.clone()),
        journal: Some(lib.st.journal.clone()),
    });
    (lib, importer)
}

async fn rescan(lib: &Lib) {
    Scanner::new(lib.st.db.clone(), lib.root.clone())
        .await
        .unwrap()
        .scan(false)
        .await
        .unwrap();
}

async fn health(lib: &Lib) -> Value {
    let res = lib
        .app
        .clone()
        .oneshot(Request::get("/health").body(Body::empty()).unwrap())
        .await
        .unwrap();
    serde_json::from_slice(&res.into_body().collect().await.unwrap().to_bytes()).unwrap()
}

#[tokio::test]
async fn liked_online_songs_are_imported_into_the_library() {
    let (lib, importer) = importing("import", None).await;
    lib.get("star?id=dz-track-1001").await;
    let id = lib.get("getStarred2?").await["starred2"]["song"][0]["id"]
        .as_str()
        .unwrap()
        .to_owned();
    assert_eq!(health(&lib).await["imports"]["pending"], 1);

    assert_eq!(importer.clone().run_due().await.unwrap(), 1);
    let file = lib
        .root
        .join("Musonic/Daft Punk/Discovery/01 - One More Time.mp3");
    assert!(file.is_file(), "filed by album artist and album");
    assert!(!file.with_extension("mp3.part").exists());
    rescan(&lib).await;
    let song = lib.get(&format!("getSong?id={id}")).await["song"].clone();
    assert_eq!(
        song["path"],
        "Musonic/Daft Punk/Discovery/01 - One More Time.mp3"
    );
    assert!(song["starred"].is_string(), "same track, still liked");
    let h = health(&lib).await;
    assert_eq!(h["imports"]["done"], 1);
    assert_eq!(h["imports"]["pending"], 0);
    let line = &lib.st.journal.read(Default::default()).await.unwrap()[0];
    assert_eq!(line.code, "import.done");
    assert_eq!(line.target.as_deref(), Some("One More Time — Daft Punk"));
    assert!(line.user.is_some(), "who asked");
    // Nothing left to do; liking again does not import twice.
    lib.get("star?id=dz-track-1001").await;
    assert_eq!(importer.clone().run_due().await.unwrap(), 0);

    // Added to a playlist: imported as well.
    lib.get("createPlaylist?name=Mix&songId=dz-track-1002")
        .await;
    assert_eq!(importer.clone().run_due().await.unwrap(), 1);
    assert!(
        lib.root
            .join("Musonic/Daft Punk/Discovery/02 - Aerodynamic.mp3")
            .is_file()
    );
}

#[tokio::test]
async fn online_albums_and_artists_are_liked_whole() {
    let (lib, importer) = importing("import-album", None).await;
    lib.get("star?albumId=dz-album-302127&artistId=dz-artist-27")
        .await;
    let r = lib.get("getStarred2?").await;
    let album = r["starred2"]["album"][0].clone();
    assert!(!album["id"].as_str().unwrap().starts_with("dz-"));
    assert_eq!(album["name"], "Discovery");
    assert_eq!(album["coverArt"], album["id"], "its online cover");
    assert_eq!(r["starred2"]["artist"][0]["name"], "Daft Punk");
    assert!(
        r["starred2"]["song"].as_array().unwrap().is_empty(),
        "the album, not its songs"
    );
    // Its songs are imported.
    assert_eq!(importer.clone().run_due().await.unwrap(), 2);
    rescan(&lib).await;
    let r = lib
        .get(&format!("getAlbum?id={}", album["id"].as_str().unwrap()))
        .await;
    assert_eq!(r["album"]["song"].as_array().unwrap().len(), 2);
    assert!(r["album"]["song"][0]["path"].is_string());
}

#[tokio::test]
async fn failed_imports_are_tried_again_then_given_up() {
    let (lib, importer) = importing("import-fail", Some("none")).await;
    lib.get("star?id=dz-track-1001").await;
    // The preview is never imported: no provider has it.
    assert_eq!(importer.clone().run_due().await.unwrap(), 1);
    let (state, attempts, error): (String, i64, String) = lib
        .st
        .db
        .call(|c| {
            Ok(c.query_row(
                "SELECT state, attempts, last_error FROM import_job",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )?)
        })
        .await
        .unwrap();
    assert_eq!((state.as_str(), attempts), ("pending", 1));
    assert!(error.contains("no provider"));
    assert_eq!(importer.clone().run_due().await.unwrap(), 0, "not due yet");
    for _ in 0..4 {
        lib.st
            .db
            .call(|c| {
                c.execute("UPDATE import_job SET next_try_at = 0", [])?;
                Ok(())
            })
            .await
            .unwrap();
        importer.clone().run_due().await.unwrap();
    }
    assert_eq!(health(&lib).await["imports"]["failed"], 1);
    let lines = lib.st.journal.read(Default::default()).await.unwrap();
    assert_eq!(
        lines[0].code, "import.failed",
        "written once, when given up"
    );
    assert_eq!(
        lines
            .iter()
            .filter(|l| l.code.starts_with("import"))
            .count(),
        1
    );
    // Liked again: a fresh start.
    lib.get("star?id=dz-track-1001").await;
    assert_eq!(health(&lib).await["imports"]["pending"], 1);
}

#[tokio::test]
async fn expired_credentials_show_as_an_alert() {
    let (lib, importer) = importing("import-expired", Some("expired")).await;
    lib.get("star?id=dz-track-1001").await;
    importer.clone().run_due().await.unwrap();
    let h = health(&lib).await;
    assert_eq!(h["status"], "warning");
    assert_eq!(h["alerts"]["deezer-files"], "credentials_expired");
}

// Import from Navidrome -------------------------------------------------------------------

/// A Navidrome database with the tables and columns the import reads.
fn fake_navidrome(dir: &std::path::Path) -> std::path::PathBuf {
    let path = dir.join("navidrome.db");
    let c = rusqlite::Connection::open(&path).unwrap();
    c.execute_batch(
        "CREATE TABLE user(id TEXT, user_name TEXT, password TEXT);
         CREATE TABLE media_file(id TEXT, path TEXT, album_id TEXT);
         CREATE TABLE artist(id TEXT, name TEXT);
         CREATE TABLE annotation(user_id TEXT, item_id TEXT, item_type TEXT, play_count INT,
                                 play_date TEXT, rating INT, starred INT, starred_at TEXT);
         CREATE TABLE playlist(id TEXT, name TEXT, comment TEXT, public INT, created_at TEXT,
                               updated_at TEXT, owner_id TEXT);
         CREATE TABLE playlist_tracks(id INT, playlist_id TEXT, media_file_id TEXT);
         CREATE TABLE scrobbles(media_file_id TEXT, user_id TEXT, submission_time INT);
         INSERT INTO user VALUES ('u1', 'doodz', 'secret'), ('u2', 'Hugo', 'secret');
         -- Hoppípolla written in another Unicode form and case.
         INSERT INTO media_file VALUES
           ('nd1', 'sigur ro' || char(769) || 's/Takk/03 - Hoppi' || char(769) || 'polla.WAV', 'ndA'),
           ('nd2', 'Sigur Rós/Takk/01 - Takk.wav', 'ndA'),
           ('nd3', 'Daft Punk/RAM/08 - Get Lucky.wav', 'ndB'),
           ('nd4', 'Gone/Gone/01 - Gone.mp3', 'ndC');
         INSERT INTO artist VALUES ('ndX', 'Sigur Rós');
         INSERT INTO annotation VALUES
           ('u1', 'nd1', 'media_file', 5, '2026-10-12 05:45:23.157569791+00:00', 4, 1,
            '2026-05-20 13:22:06.682938858+00:00'),
           ('u1', 'ndA', 'album', 3, '2026-10-01 10:00:00+00:00', 0, 0, NULL),
           ('u1', 'ndX', 'artist', 7, NULL, 0, 1, '2026-06-01 08:00:00+00:00'),
           ('u2', 'nd3', 'media_file', 9, NULL, 0, 1, '2026-06-01 08:00:00+00:00');
         INSERT INTO playlist VALUES
           ('p1', 'Road trip', 'Summer', 1, '2026-04-20 23:56:58.462228638+00:00',
            '2026-04-21 10:00:00+00:00', 'u1'),
           ('p2', 'Hugo''s', '', 0, '2026-04-20 23:56:58+00:00', '2026-04-20 23:56:58+00:00', 'u2');
         INSERT INTO playlist_tracks VALUES (1, 'p1', 'nd3'), (2, 'p1', 'nd4'), (3, 'p1', 'nd1'), (1, 'p2', 'nd2');
         INSERT INTO scrobbles VALUES ('nd1', 'u1', 1760000000), ('nd1', 'u1', 1760000500), ('nd3', 'u2', 1760000000);",
    )
    .unwrap();
    path
}

#[tokio::test]
async fn navidrome_playlists_likes_and_plays_are_imported_with_their_ids() {
    use crate::library::navidrome::{NavidromeOptions, import};
    let lib = library("navidrome").await;
    let nd = fake_navidrome(&lib.st.data_dir);
    let run = |opts| {
        let p = nd.clone();
        lib.st.db.call(move |c| import(c, &p, opts))
    };
    let r = run(NavidromeOptions::default()).await.unwrap();
    assert_eq!(r.users, ["doodz"]);
    assert_eq!(r.users_skipped, ["Hugo"]);
    assert_eq!((r.files_matched, r.files_not_found), (3, 1));
    assert_eq!(r.ids_kept, 3);
    assert_eq!(
        (r.playlists, r.playlist_entries, r.playlist_entries_missing),
        (1, 2, 1)
    );
    assert_eq!(r.plays, 2);

    // The track answers under its Navidrome id, liked, rated, counted.
    let s = lib.get("getSong?id=nd1").await["song"].clone();
    assert_eq!(s["title"], "Hoppípolla");
    assert_eq!(s["userRating"], 4);
    assert_eq!(s["playCount"], 5);
    assert!(
        s["starred"]
            .as_str()
            .unwrap()
            .starts_with("2026-05-20T13:22:06")
    );
    assert!(
        s["played"]
            .as_str()
            .unwrap()
            .starts_with("2026-10-12T05:45")
    );
    let r = lib.get("getPlaylist?id=p1").await;
    assert_eq!(r["playlist"]["name"], "Road trip");
    assert_eq!(r["playlist"]["comment"], "Summer");
    assert_eq!(r["playlist"]["public"], true);
    assert_eq!(lib.entries("p1").await, ["nd3", "nd1"]);
    let album = s["albumId"].as_str().unwrap();
    assert_eq!(
        lib.get(&format!("getAlbum?id={album}")).await["album"]["playCount"],
        3
    );
    assert_eq!(
        lib.get("getStarred2?").await["starred2"]["artist"][0]["name"],
        "Sigur Rós"
    );

    // Again: nothing doubled. A rescan keeps the ids.
    let r = run(NavidromeOptions::default()).await.unwrap();
    assert_eq!(
        (r.playlists, r.playlists_already_there, r.plays, r.ids_kept),
        (0, 1, 0, 0)
    );
    assert_eq!(lib.entries("p1").await, ["nd3", "nd1"]);
    Scanner::new(lib.st.db.clone(), lib.root.clone())
        .await
        .unwrap()
        .scan(true)
        .await
        .unwrap();
    assert_eq!(lib.get("getSong?id=nd1").await["song"]["playCount"], 5);
}

#[tokio::test]
async fn a_moved_music_folder_keeps_its_tracks() {
    let mut lib = library("moved").await;
    let id = lib.song_id("hoppipolla").await;
    let moved = temp_dir("moved-elsewhere");
    let _ = std::fs::remove_dir(&moved);
    std::fs::rename(&lib.root, &moved).unwrap();
    lib.root = moved;
    rescan(&lib).await;
    let s = lib.get(&format!("getSong?id={id}")).await["song"].clone();
    assert_eq!(
        s["title"], "Hoppípolla",
        "same track, found in the new place"
    );
    let (_, _, body) = lib.raw(&format!("stream?id={id}&{AUTH}"), None).await;
    assert!(body.len() > 1000, "and its file plays");
}

#[tokio::test]
async fn online_items_are_marked_and_the_server_tells_what_it_is() {
    let (lib, importer) = importing("marked", None).await;
    let local = lib.song_id("hoppipolla").await;
    assert!(
        lib.get(&format!("getSong?id={local}")).await["song"]
            .get("online")
            .is_none()
    );
    let r = lib.get("search3?query=one%20more").await;
    assert_eq!(r["searchResult3"]["song"][0]["online"], true);
    assert_eq!(r["searchResult3"]["album"][0]["online"], true);
    assert_eq!(r["searchResult3"]["artist"][0]["online"], true);
    lib.get("star?id=dz-track-1001&albumId=dz-album-302127&artistId=dz-artist-27")
        .await;
    let r = lib.get("getStarred2?").await;
    assert_eq!(
        r["starred2"]["song"][0]["online"], true,
        "liked, not imported yet"
    );
    assert_eq!(r["starred2"]["album"][0]["online"], true);
    // Daft Punk already has an album in the library (Get Lucky).
    assert!(r["starred2"]["artist"][0].get("online").is_none());
    importer.clone().run_due().await.unwrap();
    rescan(&lib).await;
    let r = lib.get("getStarred2?").await;
    assert!(r["starred2"]["song"][0].get("online").is_none(), "imported");
    assert!(r["starred2"]["album"][0].get("online").is_none());

    // Detection: the OpenSubsonic extension and /v1/info, both without signing in.
    let (_, _, body) = lib.raw("getOpenSubsonicExtensions?f=json", None).await;
    let v: Value = serde_json::from_slice(&body).unwrap();
    let names: Vec<&str> = v["subsonic-response"]["openSubsonicExtensions"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["name"].as_str().unwrap())
        .collect();
    assert!(names.contains(&"musonicServer"));
    let res = lib
        .app
        .clone()
        .oneshot(Request::get("/v1/info").body(Body::empty()).unwrap())
        .await
        .unwrap();
    let info: Value =
        serde_json::from_slice(&res.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(info["server"], "musonic");
    assert_eq!(info["api"], 1);
    let features: Vec<&str> = info["features"]
        .as_array()
        .unwrap()
        .iter()
        .map(|f| f.as_str().unwrap())
        .collect();
    assert!(
        features.contains(&"online")
            && features.contains(&"imports")
            && features.contains(&"events")
    );
}

// Real-time events ------------------------------------------------------------------------

#[tokio::test]
async fn changes_reach_the_accounts_devices_at_once() {
    use futures_util::StreamExt;
    use tokio_tungstenite::{connect_async, tungstenite::Message};
    let lib = library("events").await;
    let me = lib.st.users.list().await.unwrap()[0].id.clone();
    let (_, key) = lib.st.users.create_api_key(&me, "laptop").await.unwrap();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let app = lib.app.clone();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });

    let (mut ws, _) = connect_async(format!("ws://{addr}/v1/events?token={key}&device=laptop"))
        .await
        .unwrap();
    let mut next = async || -> Value {
        let msg = tokio::time::timeout(std::time::Duration::from_secs(5), ws.next())
            .await
            .expect("an event")
            .unwrap()
            .unwrap();
        match msg {
            Message::Text(t) => serde_json::from_str(&t).unwrap(),
            other => panic!("unexpected {other:?}"),
        }
    };
    let hello = next().await;
    assert_eq!(hello["type"], "hello");
    assert_eq!(hello["device"], "laptop");
    assert_eq!(hello["user"]["username"], "Doodz");

    // A like from the phone.
    let id = lib.song_id("hoppipolla").await;
    lib.get(&format!("star?id={id}&device=phone")).await;
    let e = next().await;
    assert_eq!(e["type"], "likes");
    assert_eq!(e["by"], "phone");
    assert_eq!(e["items"][0]["id"], id.as_str());
    assert_eq!(e["items"][0]["starred"], true);

    // Another account's changes are not sent here.
    lib.st
        .users
        .create("Other", "other password", false)
        .await
        .unwrap();
    lib.raw(
        &format!("star?id={id}&u=Other&p=other%20password&f=json"),
        None,
    )
    .await;
    lib.get("createPlaylist?name=Mix").await;
    let e = next().await;
    assert_eq!(
        e["type"], "playlist",
        "the other account's like was skipped"
    );
    assert_eq!(e["action"], "created");
    lib.get(&format!("setRating?id={id}&rating=3")).await;
    assert_eq!(next().await["rating"], 3);
    lib.get(&format!("scrobble?id={id}")).await;
    assert_eq!(next().await["type"], "play");
    lib.get(&format!("savePlayQueue?id={id}")).await;
    assert_eq!(next().await["type"], "queue");

    // Without a valid token: refused.
    assert!(
        connect_async(format!("ws://{addr}/v1/events?token=msk_nope"))
            .await
            .is_err()
    );
    assert!(
        connect_async(format!("ws://{addr}/v1/events"))
            .await
            .is_err()
    );
}

#[tokio::test]
async fn the_account_is_told_when_its_import_is_done() {
    let (lib, importer) = importing("import-event", None).await;
    let me = lib.st.users.list().await.unwrap()[0].id.clone();
    let mut rx = lib.st.events.subscribe();
    lib.get("star?id=dz-track-1001").await;
    assert_eq!(rx.recv().await.unwrap().message["type"], "likes");
    importer.clone().run_due().await.unwrap();
    let e = rx.recv().await.unwrap();
    assert_eq!(e.user_id, me);
    assert_eq!(e.message["type"], "import");
    assert_eq!(e.message["state"], "done");
    assert!(
        e.message["path"]
            .as_str()
            .unwrap()
            .ends_with("One More Time.mp3")
    );
}

#[tokio::test]
async fn rights_and_quotas_are_applied_to_users() {
    use crate::users::admin::Limits;
    let (lib, importer) = importing("rights", None).await;
    let hugo = lib
        .st
        .users
        .create("Hugo", "his password", false)
        .await
        .unwrap();
    let as_hugo = |q: &str| format!("{q}&u=Hugo&p=his%20password&f=json");
    let get_hugo = async |q: &str| -> Value {
        let (_, _, body) = lib.raw(&as_hugo(q), None).await;
        serde_json::from_slice::<Value>(&body).unwrap()["subsonic-response"].clone()
    };

    // Unlimited by default: online search, like → import.
    let r = get_hugo("search3?query=one%20more").await;
    assert_eq!(r["searchResult3"]["song"][0]["id"], "dz-track-1001");

    // No online catalog, no import, no download, private playlists.
    let none = Limits {
        can_import: false,
        can_online: false,
        can_download: false,
        can_public_playlists: false,
        ..Limits::default()
    };
    lib.st.users.set_limits(&hugo.id, none).await.unwrap();
    let r = get_hugo("search3?query=one%20more").await;
    assert!(
        r["searchResult3"]["song"]
            .as_array()
            .unwrap()
            .iter()
            .all(|s| s.get("online").is_none()),
        "library only"
    );
    assert_eq!(get_hugo("star?id=dz-track-1001").await["error"]["code"], 70);
    let local = lib.song_id("hoppipolla").await;
    assert_eq!(
        get_hugo(&format!("download?id={local}")).await["error"]["code"],
        50
    );
    let pl = get_hugo("createPlaylist?name=Mine").await["playlist"]["id"]
        .as_str()
        .unwrap()
        .to_owned();
    get_hugo(&format!("updatePlaylist?playlistId={pl}&public=true")).await;
    assert_eq!(
        get_hugo(&format!("getPlaylist?id={pl}")).await["playlist"]["public"],
        false
    );

    // Online allowed but no imports: liked, not imported.
    let online_only = Limits {
        can_import: false,
        ..Limits::default()
    };
    lib.st
        .users
        .set_limits(&hugo.id, online_only)
        .await
        .unwrap();
    get_hugo("star?id=dz-track-1001").await;
    assert_eq!(importer.clone().run_due().await.unwrap(), 0);

    // One import a day.
    let one_a_day = Limits {
        imports_per_day: Some(1),
        ..Limits::default()
    };
    lib.st.users.set_limits(&hugo.id, one_a_day).await.unwrap();
    get_hugo("star?id=dz-track-1002").await;
    get_hugo("createPlaylist?name=More&songId=dz-track-1001").await;
    assert_eq!(
        importer.clone().run_due().await.unwrap(),
        1,
        "the second waits for tomorrow"
    );

    // Administrators are never limited.
    let (status, headers, _) = lib.raw(&format!("download?id={local}&{AUTH}"), None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        !headers[header::CONTENT_TYPE]
            .to_str()
            .unwrap()
            .contains("json"),
        "the file"
    );
}

// The administration console (tranches C4 to C7) ------------------------------------------

/// Calls `/v1…` as the administrator: (status, JSON or raw bytes as a string).
async fn console(lib: &Lib, method: &str, uri: &str, body: Option<Value>) -> (StatusCode, Value) {
    let admin = lib
        .st
        .users
        .check_password("Doodz", "correct horse")
        .await
        .unwrap()
        .unwrap();
    let token = lib.st.users.create_session(&admin.id).await.unwrap();
    let mut req = Request::builder()
        .method(method)
        .uri(uri)
        .header(header::AUTHORIZATION, format!("Bearer {token}"));
    if body.is_some() {
        req = req.header(header::CONTENT_TYPE, "application/json");
    }
    let res = lib
        .app
        .clone()
        .oneshot(
            req.body(body.map_or(Body::empty(), |b| Body::from(b.to_string())))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = res.status();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let value = serde_json::from_slice(&bytes).unwrap_or_else(|_| {
        Value::String(String::from_utf8_lossy(&bytes[..bytes.len().min(16)]).into())
    });
    (status, value)
}

#[tokio::test]
async fn the_console_looks_after_the_library() {
    let mut lib = library("console-library").await;
    lib.st.music_dir = Some(lib.root.clone());
    lib.app = router(lib.st.clone());

    let (s, o) = console(&lib, "GET", "/v1/admin/library", None).await;
    assert_eq!(s, StatusCode::OK, "{o}");
    assert_eq!(o["tracks"], 3);
    assert_eq!(o["missing"], 0);
    assert_eq!(o["noCover"], 2, "only Hoppípolla has a picture");
    let (_, page) = console(&lib, "GET", "/v1/admin/library/tracks?q=Lucky", None).await;
    assert_eq!(page["total"], 1);
    assert_eq!(page["tracks"][0]["source"], "file");
    let id = page["tracks"][0]["id"].as_str().unwrap().to_owned();
    let (_, page) = console(&lib, "GET", "/v1/admin/library/tracks?filter=nocover", None).await;
    assert_eq!(page["total"], 2);

    let (s, d) = console(&lib, "GET", &format!("/v1/admin/library/tracks/{id}"), None).await;
    assert_eq!(s, StatusCode::OK, "{d}");
    assert_eq!(d["files"][0]["format"], "wav");
    assert_eq!(d["genres"][0], "Electro");
    let file = d["files"][0]["id"].as_str().unwrap().to_owned();

    // Listening: the token in the address, ranges allowed.
    let admin = lib
        .st
        .users
        .check_password("Doodz", "correct horse")
        .await
        .unwrap()
        .unwrap();
    let token = lib.st.users.create_session(&admin.id).await.unwrap();
    let res = lib
        .app
        .clone()
        .oneshot(
            Request::get(format!("/v1/admin/library/files/{file}?token={token}"))
                .header(header::RANGE, "bytes=0-3")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::PARTIAL_CONTENT);
    let res = lib
        .app
        .clone()
        .oneshot(
            Request::get(format!("/v1/admin/library/files/{file}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::UNAUTHORIZED);

    std::fs::remove_file(lib.root.join("Daft Punk/RAM/08 - Get Lucky.wav")).unwrap();
    rescan(&lib).await;
    let (_, o) = console(&lib, "GET", "/v1/admin/library", None).await;
    assert_eq!(o["missing"], 1);
    let (_, page) = console(&lib, "GET", "/v1/admin/library/tracks?filter=missing", None).await;
    assert_eq!(page["tracks"][0]["source"], "missing");
}

#[tokio::test]
async fn the_console_manages_imports_settings_and_backups() {
    let lib = library("console-system").await;
    let (_, page) = console(&lib, "GET", "/v1/admin/library/tracks?q=Takk", None).await;
    let track = page["tracks"][0]["id"].as_str().unwrap().to_owned();
    let t = track.clone();
    lib.st
        .db
        .call(move |c| {
            c.execute(
                "INSERT INTO import_job(track_id, state, attempts, last_error) VALUES (?1, 'failed', 5, 'gone')",
                [&t],
            )?;
            Ok(())
        })
        .await
        .unwrap();
    let (s, l) = console(&lib, "GET", "/v1/admin/imports?state=failed", None).await;
    assert_eq!(s, StatusCode::OK, "{l}");
    assert_eq!(l["total"], 1);
    assert_eq!(l["jobs"][0]["lastError"], "gone");
    assert_eq!(l["counts"]["failed"], 1);
    let (_, r) = console(&lib, "POST", "/v1/admin/imports/retry-failed", None).await;
    assert_eq!(r["retried"], 1);
    let (_, l) = console(&lib, "GET", "/v1/admin/imports", None).await;
    assert_eq!(l["jobs"][0]["state"], "pending");
    let (s, _) = console(&lib, "DELETE", &format!("/v1/admin/imports/{track}"), None).await;
    assert_eq!(s, StatusCode::OK);
    let (_, l) = console(&lib, "GET", "/v1/admin/imports", None).await;
    assert_eq!(l["total"], 0);
    let (s, p) = console(&lib, "GET", "/v1/admin/providers", None).await;
    assert_eq!(s, StatusCode::OK, "{p}");

    // Settings: saved now, applied at the next start.
    let (_, before) = console(&lib, "GET", "/v1/admin/settings", None).await;
    assert_eq!(before["restartNeeded"], false);
    let (s, after) = console(
        &lib,
        "PUT",
        "/v1/admin/settings",
        Some(serde_json::json!({"key": "import_quality", "value": "flac"})),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "{after}");
    assert_eq!(after["restartNeeded"], true);
    let (s, _) = console(
        &lib,
        "PUT",
        "/v1/admin/settings",
        Some(serde_json::json!({"key": "bind", "value": "0.0.0.0:80"})),
    )
    .await;
    assert_eq!(s, StatusCode::BAD_REQUEST);

    // Backups: one now, listed, downloaded.
    let (s, b) = console(&lib, "POST", "/v1/admin/backups", None).await;
    assert_eq!(s, StatusCode::OK, "{b}");
    let name = b["name"].as_str().unwrap().to_owned();
    let (_, all) = console(&lib, "GET", "/v1/admin/backups", None).await;
    assert_eq!(all["backups"][0]["name"], name.as_str());
    let (s, file) = console(&lib, "GET", &format!("/v1/admin/backups/{name}"), None).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(file, "SQLite format 3\0");
    let (s, _) = console(&lib, "GET", "/v1/admin/backups/..%2Fmusonic.db", None).await;
    assert_eq!(s, StatusCode::NOT_FOUND);

    let (s, _) = console(&lib, "GET", "/v1/admin/logs?level=warn", None).await;
    assert_eq!(s, StatusCode::OK);
    std::fs::create_dir_all(lib.st.data_dir.join("cache/covers")).unwrap();
    std::fs::write(lib.st.data_dir.join("cache/covers/a.jpg"), [0u8; 100]).unwrap();
    let (_, c) = console(&lib, "POST", "/v1/admin/caches/clear", None).await;
    assert_eq!(c["freed"], 100);

    // Devices and the sign-in limiter.
    let admin = lib
        .st
        .users
        .check_password("Doodz", "correct horse")
        .await
        .unwrap()
        .unwrap();
    lib.st
        .users
        .create_api_key(&admin.id, "Pixel")
        .await
        .unwrap();
    let (_, d) = console(&lib, "GET", "/v1/admin/devices", None).await;
    assert_eq!(d["devices"][0]["name"], "Pixel");
    for i in 0..10 {
        lib.st
            .limiter
            .failed("9.9.9.9", "Hugo", &format!("guess {i}"));
    }
    let (_, b) = console(&lib, "GET", "/v1/admin/blocked", None).await;
    assert_eq!(b[0]["addr"], "9.9.9.9");
    let (s, _) = console(
        &lib,
        "DELETE",
        "/v1/admin/blocked?addr=9.9.9.9&username=hugo",
        None,
    )
    .await;
    assert_eq!(s, StatusCode::OK);
    assert!(lib.st.limiter.allowed("9.9.9.9", "Hugo"));
}

#[tokio::test]
async fn kept_answers_follow_likes_and_the_library() {
    let lib = library("kept").await;
    let artists = |r: Value| -> Vec<(String, bool)> {
        r["artists"]["index"]
            .as_array()
            .unwrap()
            .iter()
            .flat_map(|i| i["artist"].as_array().unwrap().clone())
            .map(|a| {
                (
                    a["name"].as_str().unwrap().to_owned(),
                    a["starred"].is_string(),
                )
            })
            .collect()
    };
    assert_eq!(
        lib.get("getGenres?").await["genres"]["genre"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    let before = artists(lib.get("getArtists?").await);
    assert!(before.iter().all(|(_, starred)| !starred));
    let random_albums = |r: Value| -> Vec<(String, i64)> {
        let mut v: Vec<_> = r["albumList2"]["album"]
            .as_array()
            .unwrap()
            .iter()
            .map(|a| {
                (
                    a["name"].as_str().unwrap().to_owned(),
                    a["songCount"].as_i64().unwrap(),
                )
            })
            .collect();
        v.sort();
        v
    };
    let all = random_albums(lib.get("getAlbumList2?type=alphabeticalByName").await);
    assert_eq!(
        random_albums(lib.get("getAlbumList2?type=random&size=50").await),
        all,
        "every album, with its song count"
    );
    assert_eq!(
        lib.get("getAlbumList2?type=random&size=1").await["albumList2"]["album"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    let first = lib.get("getArtists?").await["artists"]["index"][0]["artist"][0]["id"]
        .as_str()
        .unwrap()
        .to_owned();
    lib.get(&format!("star?artistId={first}")).await;
    let liked = artists(lib.get("getArtists?").await);
    assert!(liked[0].1, "the like shows at once");
    assert_eq!(liked.iter().filter(|(_, s)| *s).count(), 1);
    lib.get(&format!("unstar?artistId={first}")).await;
    assert_eq!(artists(lib.get("getArtists?").await), before);

    // A file gone: its album, and an artist with nothing else, leave the lists.
    let takk = lib.song_id("takk").await;
    let hoppipolla = lib.song_id("hoppipolla").await;
    lib.set_missing(&takk, true).await;
    lib.set_missing(&hoppipolla, true).await;
    let names: Vec<String> = artists(lib.get("getArtists?").await)
        .into_iter()
        .map(|(n, _)| n)
        .collect();
    assert_eq!(names, ["Daft Punk"]);
    let genres: Vec<String> = lib.get("getGenres?").await["genres"]["genre"]
        .as_array()
        .unwrap()
        .iter()
        .map(|g| g["value"].as_str().unwrap().to_owned())
        .collect();
    assert!(
        !genres.iter().any(|g| g == "Post-Rock"),
        "a genre without files leaves: {genres:?}"
    );
    assert_eq!(
        random_albums(lib.get("getAlbumList2?type=random&size=50").await).len(),
        1,
        "an album without files leaves the draw"
    );
    let r = lib.get("getRandomSongs?size=50").await;
    assert_eq!(r["randomSongs"]["song"].as_array().unwrap().len(), 1);
    lib.set_missing(&takk, false).await;
    let r = lib.get("getRandomSongs?size=50").await;
    assert_eq!(r["randomSongs"]["song"].as_array().unwrap().len(), 2);
}

#[tokio::test]
async fn kept_answers_are_not_sent_again_to_a_client_that_has_them() {
    let lib = library("etag").await;
    let uri = format!("getArtists?{AUTH}");
    let (status, headers, body) = lib.raw(&uri, None).await;
    assert_eq!(status, StatusCode::OK);
    let etag = headers[header::ETAG].to_str().unwrap().to_owned();
    assert!(etag.starts_with("W/\""));
    let again = lib
        .raw_with(&uri, &[(header::IF_NONE_MATCH, etag.as_str())])
        .await;
    assert_eq!(again.0, StatusCode::NOT_MODIFIED);
    assert!(again.2.is_empty());
    let other = lib
        .raw_with(&uri, &[(header::IF_NONE_MATCH, "W/\"other\"")])
        .await;
    assert_eq!(other.0, StatusCode::OK);
    assert_eq!(other.2, body);
    // A like changes the answer: a new tag.
    let id = lib.get("getArtists?").await["artists"]["index"][0]["artist"][0]["id"]
        .as_str()
        .unwrap()
        .to_owned();
    lib.get(&format!("star?artistId={id}")).await;
    let changed = lib
        .raw_with(&uri, &[(header::IF_NONE_MATCH, etag.as_str())])
        .await;
    assert_eq!(changed.0, StatusCode::OK);
    assert_ne!(changed.1[header::ETAG].to_str().unwrap(), etag);
}

#[tokio::test]
async fn the_most_asked_answers_are_made_again_after_a_write() {
    let lib = library("hot").await;
    lib.get("getArtists?").await;
    lib.get("getArtists?").await;
    let user = lib
        .st
        .users
        .check_password("Doodz", "correct horse")
        .await
        .unwrap()
        .unwrap();
    let key = super::AnswerCache::key(
        &user.id,
        "getArtists",
        &super::Params::parse(Some("f=json"), &[]),
        false,
    )
    .unwrap();
    assert!(lib.st.answers.get(&key, lib.st.db.changes()).is_some());
    let id = lib.song_id("takk").await;
    lib.get(&format!("star?id={id}")).await;
    assert!(
        lib.st.answers.get(&key, lib.st.db.changes()).is_none(),
        "the like emptied it"
    );
    for _ in 0..50 {
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        if lib.st.answers.get(&key, lib.st.db.changes()).is_some() {
            return;
        }
    }
    panic!("getArtists was not made again");
}

#[tokio::test]
async fn the_next_song_of_the_queue_is_prepared() {
    if std::process::Command::new("ffmpeg")
        .arg("-version")
        .output()
        .is_err()
    {
        return;
    }
    let lib = library("prepare").await;
    let (first, next) = (lib.song_id("hoppipolla").await, lib.song_id("takk").await);
    lib.get(&format!(
        "savePlayQueue?id={first}&id={next}&current={first}"
    ))
    .await;
    let (status, ..) = lib
        .raw(&format!("stream?id={first}&maxBitRate=64&{AUTH}"), None)
        .await;
    assert_eq!(status, StatusCode::OK);
    // Only the first song was asked: two kept songs means the next one was prepared.
    let kept = || {
        walk(&super::transcoded_dir(&lib.st.data_dir))
            .into_iter()
            .filter(|p| p.extension().is_some_and(|e| e == "mp3"))
            .count()
    };
    for _ in 0..100 {
        if kept() >= 2 {
            return;
        }
        tokio::time::sleep(std::time::Duration::from_millis(30)).await;
    }
    panic!("the next song was not prepared");
}

fn walk(dir: &std::path::Path) -> Vec<std::path::PathBuf> {
    let mut out = Vec::new();
    for e in std::fs::read_dir(dir).into_iter().flatten().flatten() {
        let p = e.path();
        if p.is_dir() {
            out.extend(walk(&p));
        } else {
            out.push(p);
        }
    }
    out
}

#[tokio::test]
async fn musonic_routes_answer_in_one_request() {
    let lib = library("musonic").await;
    let id = lib.song_id("Get Lucky").await;
    lib.get(&format!("star?id={id}")).await;

    let r = lib.get("getMusonicLibrary?").await;
    let all = &r["musonicLibrary"];
    assert_eq!(all["total"], 3);
    let songs = all["song"].as_array().unwrap();
    assert_eq!(songs.len(), 3);
    let lucky = songs.iter().find(|s| s["title"] == "Get Lucky").unwrap();
    assert_eq!(lucky["album"], "Random Access Memories");
    assert!(lucky["duration"].is_number() && lucky["albumId"].is_string());
    let hopp = songs.iter().find(|s| s["title"] == "Hoppípolla").unwrap();
    assert!(hopp["coverArt"].is_string());
    assert!(
        lucky.get("starred").is_none(),
        "likes change often: not in the list"
    );
    assert!(lucky.get("path").is_none() && lucky.get("playCount").is_none());

    // Kept and validated like the other lists.
    let (_, headers, _) = lib.raw(&format!("getMusonicLibrary?{AUTH}"), None).await;
    let etag = headers[header::ETAG].to_str().unwrap().to_owned();
    let (status, _, _) = lib
        .raw_with(
            &format!("getMusonicLibrary?{AUTH}"),
            &[(header::IF_NONE_MATCH, etag.as_str())],
        )
        .await;
    assert_eq!(status, StatusCode::NOT_MODIFIED);

    let r = lib.get("getMusonicHome?").await;
    let home = &r["musonicHome"];
    assert_eq!(home["newest"].as_array().unwrap().len(), 2);
    assert_eq!(home["starred"]["song"][0]["title"], "Get Lucky");
    assert!(home["playlists"].is_array() && home["recent"].is_array());

    let r = lib
        .get("getMusonicHomeMore?genre=electro&genre=nothing")
        .await;
    let more = &r["musonicHomeMore"];
    assert_eq!(more["genreMixes"][0]["genre"], "electro");
    assert_eq!(more["genreMixes"][0]["song"][0]["title"], "Get Lucky");
    assert!(more["genreMixes"][1]["song"].as_array().unwrap().is_empty());
    assert!(more["similarArtistAlbums"].as_array().unwrap().is_empty());
    assert_eq!(lib.error("getMusonicHomeMore?").await, 10);
}
