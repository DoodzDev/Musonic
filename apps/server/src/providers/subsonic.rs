//! Relays audio from another Subsonic server: an OctoFiesta in front of Navidrome, a Navidrome,
//! any Subsonic-compatible server. The track is found there by search (ISRC when both know it,
//! else title, artists and length), then streamed through.

use anyhow::{Context, Result};
use async_trait::async_trait;
use md5::{Digest, Md5};
use rand::Rng;
use serde_json::Value;

use super::{AudioFormat, AudioProvider, Quality, RemoteAudio, TrackQuery, http::open_url};
use crate::matcher::{artists_overlap, normalize_artists, same_title};

/// Seconds of difference still taken for the same recording.
const LENGTH_TOLERANCE: i64 = 5;

pub struct SubsonicProvider {
    http: reqwest::Client,
    base: String,
    user: String,
    password: String,
}

impl SubsonicProvider {
    pub fn new(base: &str, user: &str, password: &str) -> Result<Self> {
        Ok(Self {
            http: reqwest::Client::builder()
                .connect_timeout(std::time::Duration::from_secs(5))
                .build()?,
            base: base.trim_end_matches('/').to_owned(),
            user: user.to_owned(),
            password: password.to_owned(),
        })
    }

    /// `endpoint` URL with token authentication (a fresh salt each time).
    fn url(&self, endpoint: &str, params: &[(&str, &str)]) -> String {
        let salt: String = (0..12)
            .map(|_| {
                char::from(
                    b"abcdefghijklmnopqrstuvwxyz0123456789"[rand::thread_rng().gen_range(0..36)],
                )
            })
            .collect();
        let token = hex::encode(Md5::digest(format!("{}{salt}", self.password).as_bytes()));
        let mut url =
            reqwest::Url::parse(&format!("{}/rest/{endpoint}", self.base)).expect("valid base");
        url.query_pairs_mut()
            .append_pair("u", &self.user)
            .append_pair("t", &token)
            .append_pair("s", &salt)
            .append_pair("v", "1.16.1")
            .append_pair("c", "musonic-server")
            .append_pair("f", "json")
            .extend_pairs(params);
        url.into()
    }

    /// The candidate that is the same recording, if any.
    fn pick<'a>(track: &TrackQuery, songs: &'a [Value]) -> Option<&'a Value> {
        let wanted_artists = normalize_artists(track.artists.iter().map(String::as_str));
        let isrc_of = |s: &Value| -> Vec<String> {
            match &s["isrc"] {
                Value::Array(a) => a
                    .iter()
                    .filter_map(|v| v.as_str().map(str::to_owned))
                    .collect(),
                Value::String(v) => vec![v.clone()],
                _ => vec![],
            }
        };
        if let Some(isrc) = &track.isrc
            && let Some(s) = songs.iter().find(|s| isrc_of(s).contains(isrc))
        {
            return Some(s);
        }
        songs.iter().find(|s| {
            let title = s["title"].as_str().unwrap_or_default();
            let artists: Vec<String> = match s["artists"].as_array() {
                Some(list) if !list.is_empty() => list
                    .iter()
                    .filter_map(|a| a["name"].as_str().map(str::to_owned))
                    .collect(),
                _ => s["artist"]
                    .as_str()
                    .unwrap_or_default()
                    .split(['•', ',', '&'])
                    .map(|a| a.trim().to_owned())
                    .collect(),
            };
            let duration = s["duration"].as_i64().unwrap_or(0);
            same_title(&track.title, title)
                && artists_overlap(
                    &wanted_artists,
                    &normalize_artists(artists.iter().map(String::as_str)),
                )
                && (track.duration == 0
                    || duration == 0
                    || (track.duration - duration).abs() <= LENGTH_TOLERANCE)
        })
    }
}

fn format_of(song: &Value) -> Option<(AudioFormat, Quality)> {
    let bit_rate = song["bitRate"].as_i64().unwrap_or(320);
    match song["suffix"].as_str().unwrap_or("mp3") {
        "mp3" if bit_rate <= 160 => Some((AudioFormat::Mp3, Quality::Mp3_128)),
        "mp3" => Some((AudioFormat::Mp3, Quality::Mp3_320)),
        "flac" => Some((AudioFormat::Flac, Quality::Flac)),
        _ => None,
    }
}

#[async_trait]
impl AudioProvider for SubsonicProvider {
    fn id(&self) -> &'static str {
        "subsonic"
    }

    async fn open(&self, track: &TrackQuery, _wanted: Quality) -> Result<Option<RemoteAudio>> {
        if track.title.is_empty() {
            return Ok(None);
        }
        let query = match track.artists.first() {
            Some(artist) => format!("{} {artist}", track.title),
            None => track.title.clone(),
        };
        let url = self.url(
            "search3",
            &[
                ("query", &query),
                ("songCount", "20"),
                ("albumCount", "0"),
                ("artistCount", "0"),
            ],
        );
        let body: Value = self
            .http
            .get(url)
            .send()
            .await
            .context("search")?
            .error_for_status()?
            .json()
            .await
            .context("search answer")?;
        let answer = &body["subsonic-response"];
        if answer["status"] != "ok" {
            anyhow::bail!("search: {}", answer["error"]["message"]);
        }
        let songs = answer["searchResult3"]["song"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        let Some(song) = Self::pick(track, &songs) else {
            return Ok(None);
        };
        let (Some(id), Some((format, quality))) = (song["id"].as_str(), format_of(song)) else {
            return Ok(None);
        };
        // The file as it is there (no transcoding), so ranges stay exact.
        let stream = self.url("stream", &[("id", id), ("format", "raw")]);
        open_url(&self.http, &stream, format, quality).await
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn query() -> TrackQuery {
        TrackQuery {
            title: "Get Lucky (feat. Pharrell Williams)".into(),
            artists: vec!["Daft Punk".into(), "Pharrell Williams".into()],
            duration: 369,
            ..Default::default()
        }
    }

    #[test]
    fn picks_the_same_recording() {
        let songs = vec![
            json!({ "id": "a", "title": "Get Lucky", "artist": "Daft Punk", "duration": 248 }),
            json!({ "id": "b", "title": "Get Lucky", "artist": "Daft Punk", "duration": 367 }),
        ];
        assert_eq!(SubsonicProvider::pick(&query(), &songs).unwrap()["id"], "b");
        let mut q = query();
        q.isrc = Some("USQX91300108".into());
        let songs = vec![
            json!({ "id": "x", "title": "Get Lucky", "artist": "Daft Punk", "duration": 369 }),
            json!({ "id": "y", "title": "Other", "isrc": ["USQX91300108"] }),
        ];
        assert_eq!(
            SubsonicProvider::pick(&q, &songs).unwrap()["id"],
            "y",
            "ISRC first"
        );
        let songs =
            vec![json!({ "id": "z", "title": "Get Lucky", "artist": "Justice", "duration": 369 })];
        assert!(SubsonicProvider::pick(&query(), &songs).is_none());
    }

    #[test]
    fn formats() {
        assert_eq!(
            format_of(&json!({ "suffix": "mp3", "bitRate": 128 })),
            Some((AudioFormat::Mp3, Quality::Mp3_128))
        );
        assert_eq!(
            format_of(&json!({ "suffix": "flac" })).unwrap().1,
            Quality::Flac
        );
        assert_eq!(format_of(&json!({ "suffix": "opus" })), None);
    }
}
