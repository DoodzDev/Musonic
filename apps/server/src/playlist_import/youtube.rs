//! YouTube and YouTube Music playlists, from the official YouTube Data API v3 (ADR-029): a
//! public playlist (`list=PL…`) is read with an API key an administrator sets in the console.
//! Songs come as videos (title, channel, length), so their titles are cleaned before matching.
//! YouTube Music albums, liked songs and mixes are not playlists of this API: they are refused
//! with a clear message.
use std::sync::RwLock;

use anyhow::anyhow;
use async_trait::async_trait;
use rusqlite::OptionalExtension;
use serde::Deserialize;

use super::{MAX_TRACKS, PlaylistSource, SourceError, SourcePlaylist, SourceTrack, host};
use crate::db::Db;

pub const API_URL: &str = "https://www.googleapis.com/youtube/v3";
const KEY_PROPERTY: &str = "youtube_api_key";
/// Items per request: the most the API gives.
const PAGE: usize = 50;

pub struct YouTubePlaylists {
    http: reqwest::Client,
    base: String,
    key: RwLock<Option<String>>,
}

impl YouTubePlaylists {
    pub fn new(base: &str) -> anyhow::Result<Self> {
        Ok(Self {
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(20))
                .build()?,
            base: base.trim_end_matches('/').to_owned(),
            key: RwLock::new(None),
        })
    }

    pub fn has_key(&self) -> bool {
        self.key.read().unwrap().is_some()
    }

    /// At start: the key last set from the console.
    pub async fn load_key(&self, db: &Db) {
        let saved: Option<String> = db
            .call(|c| {
                Ok(c.query_row(
                    "SELECT value FROM property WHERE key = ?1",
                    [KEY_PROPERTY],
                    |r| r.get(0),
                )
                .optional()?)
            })
            .await
            .ok()
            .flatten();
        *self.key.write().unwrap() = saved.filter(|k| !k.is_empty());
    }

    /// Sets the API key after a test request; an empty value removes it.
    pub async fn set_key(&self, db: &Db, key: &str) -> anyhow::Result<()> {
        let key = key.trim().to_owned();
        if key.is_empty() {
            db.call(|c| {
                Ok(
                    c.execute("DELETE FROM property WHERE key = ?1", [KEY_PROPERTY])
                        .map(|_| ())?,
                )
            })
            .await?;
            *self.key.write().unwrap() = None;
            return Ok(());
        }
        // Any public playlist answers; a refused key fails here.
        self.get::<Page<PlaylistInfo>>(&key, "playlists", &[("part", "id"), ("id", "PL")])
            .await?;
        let value = key.clone();
        db.call(move |c| {
            c.execute(
                "INSERT INTO property(key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                [KEY_PROPERTY, value.as_str()],
            )?;
            Ok(())
        })
        .await?;
        *self.key.write().unwrap() = Some(key);
        Ok(())
    }

    async fn get<T: for<'de> Deserialize<'de>>(
        &self,
        key: &str,
        endpoint: &str,
        query: &[(&str, &str)],
    ) -> Result<T, SourceError> {
        let res = self
            .http
            .get(format!("{}/{endpoint}", self.base))
            .query(query)
            .query(&[("key", key)])
            .send()
            .await
            // Never the URL: it holds the key.
            .map_err(|e| SourceError::Unavailable(anyhow!(e.without_url())))?;
        let status = res.status();
        if status == reqwest::StatusCode::NOT_FOUND {
            return Err(SourceError::NotFound);
        }
        if !status.is_success() {
            let reason = res
                .json::<ErrorBody>()
                .await
                .ok()
                .and_then(|b| b.error.errors.into_iter().next())
                .map(|e| e.reason)
                .unwrap_or_default();
            return Err(match reason.as_str() {
                "playlistNotFound" | "playlistForbidden" => SourceError::NotFound,
                _ => SourceError::Unavailable(anyhow!("YouTube answered {status} ({reason})")),
            });
        }
        res.json::<T>()
            .await
            .map_err(|e| SourceError::Unavailable(anyhow!(e.without_url())))
    }
}

#[derive(Deserialize)]
struct ErrorBody {
    error: ErrorDetail,
}
#[derive(Deserialize)]
struct ErrorDetail {
    #[serde(default)]
    errors: Vec<ErrorReason>,
}
#[derive(Deserialize)]
struct ErrorReason {
    #[serde(default)]
    reason: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Page<T> {
    #[serde(default = "Vec::new")]
    items: Vec<T>,
    next_page_token: Option<String>,
    page_info: Option<PageInfo>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PageInfo {
    total_results: Option<u32>,
}

#[derive(Deserialize)]
struct PlaylistInfo {
    snippet: Option<PlaylistSnippet>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlaylistSnippet {
    title: String,
    channel_title: Option<String>,
    thumbnails: Option<Thumbnails>,
}
#[derive(Deserialize)]
struct Thumbnails {
    high: Option<Thumb>,
    medium: Option<Thumb>,
}
#[derive(Deserialize)]
struct Thumb {
    url: String,
}

#[derive(Deserialize)]
struct Item {
    snippet: ItemSnippet,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ItemSnippet {
    title: String,
    /// Missing for deleted or private videos.
    video_owner_channel_title: Option<String>,
    resource_id: ResourceId,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResourceId {
    video_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Video {
    id: String,
    content_details: Option<VideoDetails>,
}
#[derive(Deserialize)]
struct VideoDetails {
    duration: String,
}

/// The playlist id of a YouTube address, or why it cannot be imported.
fn playlist_id(url: &str) -> Result<String, SourceError> {
    let h = host(url).ok_or(SourceError::NotMine)?;
    if !is_youtube(&h) {
        return Err(SourceError::NotMine);
    }
    let rest = url.trim().split_once("://").map_or(url.trim(), |(_, r)| r);
    let (path, query) = rest.split_once('?').unwrap_or((rest, ""));
    let query = query.split('#').next().unwrap_or_default();
    let list = query
        .split('&')
        .find_map(|p| p.strip_prefix("list="))
        .map(str::to_owned);
    let browse = path
        .split('/')
        .skip_while(|s| *s != "browse")
        .nth(1)
        .map(str::to_owned);
    let id = match (list, browse) {
        (Some(l), _) if !l.is_empty() => l,
        (_, Some(b)) if b.starts_with("MPREb_") => return Err(unsupported_album()),
        (_, Some(b)) => b.strip_prefix("VL").unwrap_or(&b).to_owned(),
        _ => {
            return Err(SourceError::Unsupported(
                "this YouTube link is not a playlist: share the playlist itself".into(),
            ));
        }
    };
    if id.starts_with("OLAK5uy_") {
        return Err(unsupported_album());
    }
    if matches!(id.as_str(), "LM" | "LL" | "WL") {
        return Err(SourceError::Unsupported(
            "liked songs and Watch later are private to the account: copy them into a public playlist first".into(),
        ));
    }
    if id.starts_with("RD") {
        return Err(SourceError::Unsupported(
            "mixes and radios are made on the fly: save the songs into a playlist first".into(),
        ));
    }
    Ok(id)
}

fn unsupported_album() -> SourceError {
    SourceError::Unsupported(
        "YouTube Music albums cannot be read with the official API: import a playlist instead"
            .into(),
    )
}

fn is_youtube(host: &str) -> bool {
    matches!(
        host,
        "youtube.com" | "m.youtube.com" | "music.youtube.com" | "youtu.be"
    )
}

/// `PT1H2M3S` → milliseconds.
fn iso_duration_ms(d: &str) -> Option<i64> {
    let rest = d.strip_prefix("PT").or_else(|| d.strip_prefix("P0DT"))?;
    let (mut total, mut num) = (0i64, String::new());
    for c in rest.chars() {
        if c.is_ascii_digit() {
            num.push(c);
            continue;
        }
        let n: i64 = num.parse().ok()?;
        num.clear();
        total += n * match c {
            'H' => 3600,
            'M' => 60,
            'S' => 1,
            _ => return None,
        };
    }
    num.is_empty().then_some(total * 1000)
}

/// Presentation words of a video title, never part of the song's name.
const NOISE: &[&str] = &[
    "official video",
    "official music video",
    "official audio",
    "official lyric video",
    "official lyrics video",
    "official visualizer",
    "official visualiser",
    "lyric video",
    "lyrics video",
    "lyrics",
    "lyric",
    "audio",
    "visualizer",
    "visualiser",
    "music video",
    "video clip",
    "clip officiel",
    "clip",
    "hd",
    "hq",
    "4k",
];

/// The artist a channel stands for: `Artist - Topic` or `ArtistVEVO`; other channels (labels,
/// uploaders) say nothing sure.
fn channel_artist(channel: &str) -> Option<String> {
    let c = channel.trim();
    if let Some(a) = c.strip_suffix(" - Topic") {
        return Some(a.trim().to_owned());
    }
    c.strip_suffix("VEVO")
        .filter(|a| !a.is_empty())
        .map(|a| a.trim().to_owned())
}

/// Splits `Song (feat. B)` / `Song ft. B` into the song and its guests.
fn split_featuring(title: &str) -> (String, Vec<String>) {
    let lower = title.to_lowercase();
    for marker in [
        " (feat. ",
        " (ft. ",
        " [feat. ",
        " (featuring ",
        " feat. ",
        " ft. ",
        " featuring ",
    ] {
        if let Some(i) = lower.find(marker) {
            let head = title[..i].trim().to_owned();
            let tail = title[i + marker.len()..]
                .trim_end_matches([')', ']'])
                .trim();
            let guests = tail
                .split([',', '&'])
                .map(|g| g.trim().to_owned())
                .filter(|g| !g.is_empty())
                .collect();
            return (head, guests);
        }
    }
    (title.trim().to_owned(), Vec::new())
}

/// Removes `(Official Video)`, `[Lyrics]`, `| Official Audio`… but keeps version words
/// (Live, Remix, Acoustic…), which name another recording.
fn strip_noise(title: &str) -> String {
    let mut t = title.to_owned();
    for (open, close) in [('(', ')'), ('[', ']')] {
        let mut from = 0;
        while let Some(a) = t[from..].find(open).map(|i| i + from) {
            let Some(b) = t[a..].find(close).map(|i| i + a) else {
                break;
            };
            let inside = t[a + 1..b].trim().to_lowercase();
            if NOISE.contains(&inside.as_str()) {
                t.replace_range(a..=b, "");
            } else {
                from = b + 1;
            }
        }
    }
    if let Some(i) = t.find(" | ") {
        t.truncate(i);
    }
    t.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// A video of a playlist as a song: title and artists from the title and the channel.
fn track_of(video_title: &str, channel: &str, id: &str, duration_ms: Option<i64>) -> SourceTrack {
    let clean = strip_noise(video_title);
    let from_channel = channel_artist(channel);
    // "Artist - Song": only with one dash, or when the first part is the channel's artist.
    let (artist, song) = match clean.split_once(" - ") {
        Some((a, s))
            if clean.matches(" - ").count() == 1
                || from_channel
                    .as_deref()
                    .is_some_and(|c| c.eq_ignore_ascii_case(a.trim())) =>
        {
            (Some(a.trim().to_owned()), s.trim().to_owned())
        }
        _ => (None, clean.clone()),
    };
    let (title, guests) = split_featuring(&song);
    let mut artists: Vec<String> = from_channel.or(artist).into_iter().collect();
    if artists.is_empty() && !channel.trim().is_empty() {
        artists.push(channel.trim().to_owned());
    }
    for g in guests {
        if !artists.iter().any(|a| a.eq_ignore_ascii_case(&g)) {
            artists.push(g);
        }
    }
    SourceTrack {
        title,
        artists,
        album: None,
        duration_ms,
        isrc: None,
        link: Some(format!("https://music.youtube.com/watch?v={id}")),
        id: Some(id.to_owned()),
    }
}

#[async_trait]
impl PlaylistSource for YouTubePlaylists {
    fn id(&self) -> &'static str {
        "youtube"
    }

    fn knows(&self, url: &str) -> bool {
        host(url).is_some_and(|h| is_youtube(&h))
    }

    async fn playlist(&self, url: &str) -> Result<SourcePlaylist, SourceError> {
        let id = playlist_id(url)?;
        let key = self.key.read().unwrap().clone().ok_or_else(|| {
            SourceError::Unsupported(
                "no YouTube API key: an administrator adds it in the console (Imports)".into(),
            )
        })?;
        let info: Page<PlaylistInfo> = self
            .get(&key, "playlists", &[("part", "snippet"), ("id", &id)])
            .await?;
        let snippet = info
            .items
            .into_iter()
            .next()
            .and_then(|p| p.snippet)
            .ok_or(SourceError::NotFound)?;

        let mut items: Vec<(String, String, String)> = Vec::new();
        let mut total = None;
        let mut token: Option<String> = None;
        loop {
            let mut query = vec![
                ("part", "snippet".to_owned()),
                ("maxResults", PAGE.to_string()),
                ("playlistId", id.clone()),
            ];
            if let Some(t) = &token {
                query.push(("pageToken", t.clone()));
            }
            let q: Vec<(&str, &str)> = query.iter().map(|(k, v)| (*k, v.as_str())).collect();
            let page: Page<Item> = self.get(&key, "playlistItems", &q).await?;
            total = total.or(page.page_info.and_then(|p| p.total_results));
            for it in page.items {
                // Deleted and private videos have no owner.
                let (Some(channel), Some(vid)) = (
                    it.snippet.video_owner_channel_title,
                    it.snippet.resource_id.video_id,
                ) else {
                    continue;
                };
                items.push((it.snippet.title, channel, vid));
            }
            token = page.next_page_token;
            if token.is_none() || items.len() >= MAX_TRACKS {
                break;
            }
        }
        items.truncate(MAX_TRACKS);

        let mut lengths = std::collections::HashMap::new();
        for chunk in items.chunks(PAGE) {
            let ids = chunk
                .iter()
                .map(|(_, _, v)| v.as_str())
                .collect::<Vec<_>>()
                .join(",");
            let page: Page<Video> = self
                .get(&key, "videos", &[("part", "contentDetails"), ("id", &ids)])
                .await?;
            for v in page.items {
                if let Some(ms) = v.content_details.and_then(|d| iso_duration_ms(&d.duration)) {
                    lengths.insert(v.id, ms);
                }
            }
        }
        let tracks = items
            .iter()
            .map(|(t, c, v)| track_of(t, c, v, lengths.get(v).copied()))
            .collect();
        let cover = snippet
            .thumbnails
            .and_then(|t| t.high.or(t.medium))
            .map(|t| t.url);
        Ok(SourcePlaylist {
            source: "youtube".into(),
            id: Some(id.clone()),
            name: snippet.title,
            owner: snippet.channel_title,
            cover_url: cover,
            total,
            tracks,
            app_link: Some(format!("https://music.youtube.com/playlist?list={id}")),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_playlist_links() {
        let ok = |u: &str| playlist_id(u).unwrap();
        assert_eq!(
            ok("https://music.youtube.com/playlist?list=PLabc123&si=xyz"),
            "PLabc123"
        );
        assert_eq!(
            ok("https://www.youtube.com/playlist?list=PLabc123"),
            "PLabc123"
        );
        assert_eq!(
            ok("https://music.youtube.com/watch?v=vid1&list=PLabc123"),
            "PLabc123"
        );
        assert_eq!(
            ok("https://music.youtube.com/browse/VLPLabc123"),
            "PLabc123"
        );
        let refused = |u: &str| matches!(playlist_id(u), Err(SourceError::Unsupported(_)));
        assert!(refused(
            "https://music.youtube.com/playlist?list=OLAK5uy_abc"
        ));
        assert!(refused("https://music.youtube.com/browse/MPREb_abc"));
        assert!(refused("https://music.youtube.com/playlist?list=LM"));
        assert!(refused("https://music.youtube.com/watch?v=x&list=RDAMVMx"));
        assert!(refused("https://youtu.be/vid1"));
        assert!(matches!(
            playlist_id("https://open.spotify.com/playlist/x"),
            Err(SourceError::NotMine)
        ));
    }

    #[test]
    fn reads_durations() {
        assert_eq!(iso_duration_ms("PT4M13S"), Some(253_000));
        assert_eq!(iso_duration_ms("PT1H2M3S"), Some(3_723_000));
        assert_eq!(iso_duration_ms("PT45S"), Some(45_000));
        assert_eq!(iso_duration_ms("garbage"), None);
    }

    #[test]
    fn cleans_video_titles() {
        let t = track_of("Get Lucky (Official Audio)", "Daft Punk - Topic", "a", None);
        assert_eq!(
            (t.title.as_str(), t.artists.as_slice()),
            ("Get Lucky", &["Daft Punk".to_owned()][..])
        );
        let t = track_of(
            "Daft Punk - Get Lucky [Official Video]",
            "Some Label",
            "b",
            None,
        );
        assert_eq!(t.title, "Get Lucky");
        assert_eq!(t.artists, ["Daft Punk"]);
        let t = track_of(
            "Calvin Harris - This Is What You Came For (Official Video) ft. Rihanna",
            "CalvinHarrisVEVO",
            "c",
            Some(1000),
        );
        assert_eq!(t.title, "This Is What You Came For");
        assert_eq!(t.artists, ["CalvinHarris", "Rihanna"]);
        // Version words stay: they name another recording.
        let t = track_of("Song (Live)", "Band - Topic", "d", None);
        assert_eq!(t.title, "Song (Live)");
        let t = track_of("Goodbye - Remix - Extended", "Unknown channel", "e", None);
        assert_eq!(t.title, "Goodbye - Remix - Extended");
        assert_eq!(t.artists, ["Unknown channel"]);
    }

    /// A local stand-in for the YouTube Data API: two pages, a deleted video, durations.
    async fn fake_youtube() -> String {
        use axum::{Json, Router, extract::Query, routing::get};
        use serde_json::json;
        use std::collections::HashMap;
        let app = Router::new()
            .route(
                "/playlists",
                get(|Query(q): Query<HashMap<String, String>>| async move {
                    assert_eq!(q.get("key").map(String::as_str), Some("k"));
                    let found = q.get("id").map(String::as_str) == Some("PLok");
                    Json(json!({ "items": if found { json!([{ "snippet": {
                        "title": "Road trip", "channelTitle": "Doodz",
                        "thumbnails": { "high": { "url": "https://i/hq.jpg" } } } }]) } else { json!([]) } }))
                }),
            )
            .route(
                "/playlistItems",
                get(|Query(q): Query<HashMap<String, String>>| async move {
                    let item = |t: &str, c: Option<&str>, v: &str| json!({ "snippet": {
                        "title": t, "videoOwnerChannelTitle": c, "resourceId": { "videoId": v } } });
                    if !q.contains_key("pageToken") {
                        Json(json!({ "nextPageToken": "p2", "pageInfo": { "totalResults": 3 },
                            "items": [item("Get Lucky (Official Audio)", Some("Daft Punk - Topic"), "v1"),
                                      item("Deleted video", None, "v2")] }))
                    } else {
                        Json(json!({ "items": [item("Justice - D.A.N.C.E. [Official Video]", Some("Ed Banger"), "v3")] }))
                    }
                }),
            )
            .route(
                "/videos",
                get(|Query(q): Query<HashMap<String, String>>| async move {
                    assert_eq!(q.get("id").map(String::as_str), Some("v1,v3"));
                    Json(json!({ "items": [
                        { "id": "v1", "contentDetails": { "duration": "PT6M9S" } },
                        { "id": "v3", "contentDetails": { "duration": "PT4M2S" } }] }))
                }),
            );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        format!("http://{addr}")
    }

    #[tokio::test]
    async fn reads_a_playlist() {
        let yt = YouTubePlaylists::new(&fake_youtube().await).unwrap();
        let url = "https://music.youtube.com/playlist?list=PLok&si=share";
        // Without a key, the user is told to ask an administrator.
        assert!(matches!(
            yt.playlist(url).await,
            Err(SourceError::Unsupported(_))
        ));
        *yt.key.write().unwrap() = Some("k".into());

        let p = yt.playlist(url).await.unwrap();
        assert_eq!(
            (p.name.as_str(), p.owner.as_deref()),
            ("Road trip", Some("Doodz"))
        );
        assert_eq!(p.cover_url.as_deref(), Some("https://i/hq.jpg"));
        assert_eq!(p.total, Some(3));
        let songs: Vec<(&str, &str, Option<i64>)> = p
            .tracks
            .iter()
            .map(|t| (t.title.as_str(), t.artists[0].as_str(), t.duration_ms))
            .collect();
        assert_eq!(
            songs,
            [
                ("Get Lucky", "Daft Punk", Some(369_000)),
                ("D.A.N.C.E.", "Justice", Some(242_000))
            ],
            "the deleted video is left out"
        );
        assert!(matches!(
            yt.playlist("https://music.youtube.com/playlist?list=PLmissing")
                .await,
            Err(SourceError::NotFound)
        ));
    }
}
