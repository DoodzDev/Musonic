//! A playlist imported end to end: from a local stand-in for Deezer's public API, and from a
//! source reading pasted links (as the private Spotify one does).

use std::{sync::Arc, time::Duration};

use async_trait::async_trait;
use axum::{
    Router,
    body::Body,
    extract::{Path as P, Query},
    http::{Request, StatusCode, header},
    routing::get,
};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;

use super::*;
use crate::{online::Deezer, server::router};

async fn call(
    app: &Router,
    method: &str,
    uri: &str,
    token: &str,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let req = Request::builder()
        .method(method)
        .uri(uri)
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header(header::CONTENT_TYPE, "application/json")
        .body(body.map_or_else(Body::empty, |b| Body::from(b.to_string())))
        .unwrap();
    let res = app.clone().oneshot(req).await.unwrap();
    let status = res.status();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

/// Deezer: playlist 77 (3 songs, the second page asked separately), a search that finds
/// « Midnight City » by M83.
async fn fake_deezer() -> Arc<Deezer> {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let track = |id: u64, title: &str, artist: &str, secs: i64| {
        json!({ "id": id, "title": title, "duration": secs, "isrc": format!("ISRC{id}"),
                "artist": { "id": id + 100, "name": artist }, "album": { "id": id + 200, "title": format!("{title} album") } })
    };
    let songs = vec![
        track(1, "One More Time", "Daft Punk", 320),
        track(2, "Hoppípolla", "Sigur Rós", 268),
        track(3, "Midnight City", "M83", 244),
    ];
    let all = songs.clone();
    let app = Router::new()
        .route(
            "/playlist/{id}",
            get(|P(id): P<u64>| async move {
                axum::Json(if id == 77 {
                    json!({ "id": 77, "title": "Road trip", "nb_tracks": 3, "public": true,
                            "picture_xl": "https://example.org/77.jpg", "creator": { "name": "Léa" } })
                } else {
                    json!({ "error": { "type": "OAuthException", "message": "private", "code": 200 } })
                })
            }),
        )
        .route(
            "/playlist/{id}/tracks",
            get(move |Query(q): Query<std::collections::HashMap<String, String>>| {
                let index: usize = q.get("index").and_then(|i| i.parse().ok()).unwrap_or(0);
                // Two songs per page, to read several pages.
                let page: Vec<Value> = songs.iter().skip(index).take(2).cloned().collect();
                async move { axum::Json(json!({ "data": page, "total": 3 })) }
            }),
        )
        .route(
            "/track/{id}",
            get(move |P(id): P<u64>| {
                let t = all.iter().find(|t| t["id"] == id).cloned();
                async move { axum::Json(t.unwrap_or_else(|| json!({ "error": { "code": 800 } }))) }
            }),
        )
        .route(
            "/search/track",
            get(|| async { axum::Json(json!({ "data": [
                { "id": 3, "title": "Midnight City", "duration": 244, "artist": { "id": 103, "name": "M83" } },
                { "id": 9, "title": "Midnight City (Live)", "duration": 300, "artist": { "id": 103, "name": "M83" } }
            ] })) }),
        );
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    Arc::new(Deezer::new(&base).unwrap())
}

/// Reads `fake:track:<n>` links; playlist `fake:playlist:1` has the first two of four songs.
struct Links;

fn fake_song(n: &str) -> SourceTrack {
    match n {
        "1" => SourceTrack {
            title: "Midnight City".into(),
            artists: vec!["M83".into()],
            duration_ms: Some(243_000),
            ..Default::default()
        },
        "2" => SourceTrack {
            title: "One More Time (Radio Edit)".into(),
            artists: vec!["Daft Punk".into()],
            duration_ms: Some(321_000),
            ..Default::default()
        },
        "3" => SourceTrack {
            title: "Song nobody has".into(),
            artists: vec!["Nobody".into()],
            duration_ms: Some(100_000),
            ..Default::default()
        },
        _ => SourceTrack::default(),
    }
}

#[async_trait]
impl PlaylistSource for Links {
    fn id(&self) -> &'static str {
        "fake"
    }
    fn knows(&self, url: &str) -> bool {
        url.starts_with("fake:")
    }
    async fn playlist(&self, url: &str) -> Result<SourcePlaylist, SourceError> {
        // Playlist 1: the first two of four songs; playlist 2: the rest (and one already there).
        let songs: &[&str] = match url {
            "fake:playlist:1" => &["1", "2"],
            "fake:playlist:2" => &["2", "3"],
            _ => return Err(SourceError::NotFound),
        };
        let tracks = songs
            .iter()
            .map(|n| SourceTrack {
                link: Some(format!("fake:track:{n}")),
                ..fake_song(n)
            })
            .collect();
        Ok(SourcePlaylist {
            source: "fake".into(),
            id: Some("1".into()),
            name: "Partial".into(),
            total: Some(4),
            tracks,
            ..Default::default()
        })
    }
    fn links(&self, text: &str) -> Vec<String> {
        text.split_whitespace()
            .filter(|w| w.starts_with("fake:track:"))
            .map(str::to_owned)
            .collect()
    }
    async fn tracks(&self, links: &[String]) -> Result<Vec<SourceTrack>, SourceError> {
        Ok(links
            .iter()
            .map(|l| fake_song(l.rsplit(':').next().unwrap()))
            .collect())
    }
}

async fn setup() -> (Router, crate::server::AppState, String) {
    let mut st = crate::server::tests::state();
    let dz = fake_deezer().await;
    st.online = Some(dz.clone());
    st.playlist_sources = Arc::new(vec![Arc::new(Links), Arc::new(DeezerPlaylists::new(dz))]);
    PlaylistImports::start(st.clone());
    let app = router(st.clone());
    let req = Request::builder()
        .method("POST")
        .uri("/v1/setup")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({"username": "Doodz", "password": "correct horse"}).to_string(),
        ))
        .unwrap();
    let res = app.clone().oneshot(req).await.unwrap();
    let v: Value =
        serde_json::from_slice(&res.into_body().collect().await.unwrap().to_bytes()).unwrap();
    (app, st, v["token"].as_str().unwrap().to_owned())
}

async fn wait_done(app: &Router, token: &str, id: &str) -> Value {
    for _ in 0..200 {
        let (_, d) = call(
            app,
            "GET",
            &format!("/v1/playlist-imports/{id}"),
            token,
            None,
        )
        .await;
        if d["import"]["state"] == "done" || d["import"]["state"] == "failed" {
            return d;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    panic!("import {id} not done");
}

fn playlist_songs(st: &crate::server::AppState, playlist: &str) -> Vec<String> {
    let c = st.db.lock();
    c.prepare("SELECT t.title FROM playlist_track p JOIN track t ON t.id = p.track_id WHERE p.playlist_id = ?1 ORDER BY p.position")
        .unwrap()
        .query_map([playlist], |r| r.get(0))
        .unwrap()
        .collect::<rusqlite::Result<_>>()
        .unwrap()
}

#[tokio::test]
async fn a_deezer_playlist_is_made_in_the_account() {
    let (app, st, token) = setup().await;
    let url = "https://www.deezer.com/fr/playlist/77?utm_source=x";
    let (s, p) = call(
        &app,
        "POST",
        "/v1/playlist-imports/preview",
        &token,
        Some(json!({"url": url})),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "{p}");
    assert_eq!(
        (p["name"].as_str(), p["read"].as_u64(), p["owner"].as_str()),
        (Some("Road trip"), Some(3), Some("Léa"))
    );

    let (s, _) = call(
        &app,
        "POST",
        "/v1/playlist-imports/preview",
        &token,
        Some(json!({"url": "https://www.deezer.com/playlist/5"})),
    )
    .await;
    assert_eq!(s, StatusCode::NOT_FOUND, "private playlist");
    let (s, _) = call(
        &app,
        "POST",
        "/v1/playlist-imports/preview",
        &token,
        Some(json!({"url": "https://open.spotify.com/playlist/x"})),
    )
    .await;
    assert_eq!(s, StatusCode::NOT_IMPLEMENTED, "no Spotify source here");

    let (s, i) = call(
        &app,
        "POST",
        "/v1/playlist-imports",
        &token,
        Some(json!({"url": url})),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "{i}");
    let d = wait_done(&app, &token, i["id"].as_str().unwrap()).await;
    let imp = &d["import"];
    assert_eq!(
        (
            imp["total"].as_u64(),
            imp["online"].as_u64(),
            imp["missing"].as_u64()
        ),
        (Some(3), Some(3), Some(0)),
        "{d}"
    );
    let pl = imp["playlistId"].as_str().unwrap();
    assert_eq!(
        playlist_songs(&st, pl),
        ["One More Time", "Hoppípolla", "Midnight City"]
    );
    let (_, all) = call(&app, "GET", "/v1/playlist-imports", &token, None).await;
    assert_eq!(all.as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn pasted_links_complete_a_partial_playlist() {
    let (app, st, token) = setup().await;
    // A library song for « One More Time », without a file but known online.
    {
        let c = st.db.lock();
        c.execute(
            "INSERT INTO track(id, title, norm_title, norm_artists, duration_ms) VALUES ('lib', 'One More Time', 'one more time', 'daft punk', 320000)",
            [],
        )
        .unwrap();
        c.execute(
            "INSERT INTO track_source(provider, provider_id, track_id) VALUES ('other', 'x', 'lib')",
            [],
        )
        .unwrap();
    }
    let (_, i) = call(
        &app,
        "POST",
        "/v1/playlist-imports",
        &token,
        Some(json!({"url": "fake:playlist:1"})),
    )
    .await;
    let id = i["id"].as_str().unwrap().to_owned();
    let d = wait_done(&app, &token, &id).await;
    assert_eq!(d["import"]["sourceTotal"], 4, "only part of it was read");
    assert_eq!(d["tracks"][1]["trackId"], "lib", "found in the library");
    assert_eq!(d["tracks"][0]["status"], "online", "found online");
    let pl = d["import"]["playlistId"].as_str().unwrap().to_owned();

    // The whole list pasted: the playlist gets every song, the unknown one is reported.
    let text = "fake:track:1\nnoise https://elsewhere fake:track:2 fake:track:3 fake:track:4";
    let (s, p) = call(
        &app,
        "POST",
        "/v1/playlist-imports/preview",
        &token,
        Some(json!({"text": text})),
    )
    .await;
    assert_eq!((s, p["read"].as_u64()), (StatusCode::OK, Some(4)));
    let (s, _) = call(
        &app,
        "POST",
        "/v1/playlist-imports",
        &token,
        Some(json!({"text": text, "into": id})),
    )
    .await;
    assert_eq!(s, StatusCode::OK);
    let d = wait_done(&app, &token, &id).await;
    let statuses: Vec<&str> = d["tracks"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["status"].as_str().unwrap())
        .collect();
    assert_eq!(statuses, ["online", "online", "missing", "missing"], "{d}");
    assert_eq!(d["import"]["playlistId"], pl.as_str(), "the same playlist");
    assert_eq!(playlist_songs(&st, &pl), ["Midnight City", "One More Time"]);
}

#[tokio::test]
async fn another_playlist_completes_an_import() {
    let (app, st, token) = setup().await;
    let (_, i) = call(
        &app,
        "POST",
        "/v1/playlist-imports",
        &token,
        Some(json!({"url": "fake:playlist:1"})),
    )
    .await;
    let id = i["id"].as_str().unwrap().to_owned();
    let d = wait_done(&app, &token, &id).await;
    let pl = d["import"]["playlistId"].as_str().unwrap().to_owned();
    let (s, _) = call(
        &app,
        "POST",
        "/v1/playlist-imports",
        &token,
        Some(json!({"url": "fake:playlist:2", "into": id})),
    )
    .await;
    assert_eq!(s, StatusCode::OK);
    let d = wait_done(&app, &token, &id).await;
    let titles: Vec<&str> = d["tracks"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["title"].as_str().unwrap())
        .collect();
    assert_eq!(
        titles,
        [
            "Midnight City",
            "One More Time (Radio Edit)",
            "Song nobody has"
        ],
        "song 2 not twice"
    );
    assert_eq!(d["import"]["playlistId"], pl.as_str(), "the same playlist");
    assert_eq!(
        playlist_songs(&st, &pl).len(),
        1,
        "only Midnight City is found online here"
    );
}

#[tokio::test]
async fn songs_not_found_can_be_looked_for_again() {
    let (app, _st, token) = setup().await;
    let (_, i) = call(
        &app,
        "POST",
        "/v1/playlist-imports",
        &token,
        Some(json!({"text": "fake:track:1 fake:track:3"})),
    )
    .await;
    let id = i["id"].as_str().unwrap().to_owned();
    let d = wait_done(&app, &token, &id).await;
    assert_eq!(d["import"]["missing"], 1);
    let (s, r) = call(
        &app,
        "POST",
        &format!("/v1/playlist-imports/{id}/retry"),
        &token,
        None,
    )
    .await;
    assert_eq!((s, r["retried"].as_u64()), (StatusCode::OK, Some(1)));
    let d = wait_done(&app, &token, &id).await;
    assert_eq!(
        (
            d["import"]["missing"].as_u64(),
            d["import"]["online"].as_u64()
        ),
        (Some(1), Some(1)),
        "still not found, the other kept"
    );
}
