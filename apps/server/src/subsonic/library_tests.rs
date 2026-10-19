//! Browsing and playing a small scanned library through the Subsonic API.

use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode, header},
};
use http_body_util::BodyExt;
use serde_json::Value;
use tower::ServiceExt;

use crate::{
    library::Scanner,
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
