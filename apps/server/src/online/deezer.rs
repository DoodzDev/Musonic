//! Client of the public Deezer API (`api.deezer.com`): search, tracks, albums, artists. No
//! account, metadata and 30-second previews only. Answers are cached for a while and requests
//! kept under the documented limit (50 every 5 seconds).

use std::{
    collections::{HashMap, VecDeque},
    sync::Mutex,
    time::{Duration, Instant},
};

use anyhow::{Context, Result, bail};
use serde::{Deserialize, de::DeserializeOwned};
use serde_json::Value;

pub const DEFAULT_URL: &str = "https://api.deezer.com";

const RATE_WINDOW: Duration = Duration::from_secs(5);
const RATE_MAX: usize = 50;
const CACHE_TTL: Duration = Duration::from_secs(30 * 60);
const CACHE_MAX: usize = 2_000;
const TIMEOUT: Duration = Duration::from_secs(8);

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct DzArtist {
    pub id: u64,
    pub name: String,
    pub picture_xl: Option<String>,
    pub nb_album: Option<i64>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct DzGenre {
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct DzList<T> {
    pub data: Vec<T>,
    pub total: Option<i64>,
}

impl<T> Default for DzList<T> {
    fn default() -> Self {
        Self {
            data: Vec::new(),
            total: None,
        }
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct DzAlbum {
    pub id: u64,
    pub title: String,
    pub cover_xl: Option<String>,
    pub release_date: Option<String>,
    pub record_type: Option<String>,
    pub nb_tracks: Option<i64>,
    pub duration: Option<i64>,
    pub artist: Option<DzArtist>,
    pub contributors: Vec<DzArtist>,
    pub genres: DzList<DzGenre>,
    pub tracks: DzList<DzTrack>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct DzTrack {
    pub id: u64,
    pub title: String,
    /// Seconds.
    pub duration: i64,
    pub track_position: Option<i64>,
    pub disk_number: Option<i64>,
    pub isrc: Option<String>,
    pub preview: Option<String>,
    pub explicit_lyrics: bool,
    pub bpm: Option<f64>,
    pub release_date: Option<String>,
    pub artist: Option<DzArtist>,
    pub contributors: Vec<DzArtist>,
    pub album: Option<DzAlbum>,
}

impl DzTrack {
    /// Credited artists, main one first (contributors when given, else the track's artist).
    pub fn artists(&self) -> Vec<&DzArtist> {
        let mut out: Vec<&DzArtist> = Vec::new();
        for a in self.artist.iter().chain(self.contributors.iter()) {
            if !a.name.is_empty() && !out.iter().any(|o| o.id == a.id || o.name == a.name) {
                out.push(a);
            }
        }
        out
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct DzUser {
    pub name: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct DzPlaylist {
    pub id: u64,
    pub title: String,
    pub picture_xl: Option<String>,
    pub nb_tracks: Option<i64>,
    pub public: bool,
    pub creator: Option<DzUser>,
}

/// The Deezer API, shared by every request of the server.
pub struct Deezer {
    http: reqwest::Client,
    base: String,
    cache: Mutex<HashMap<String, (Instant, Value)>>,
    recent: tokio::sync::Mutex<VecDeque<Instant>>,
}

impl Deezer {
    pub fn new(base: &str) -> Result<Self> {
        Ok(Self {
            http: reqwest::Client::builder()
                .timeout(TIMEOUT)
                .user_agent(concat!("musonic-server/", env!("CARGO_PKG_VERSION")))
                .build()?,
            base: base.trim_end_matches('/').to_owned(),
            cache: Mutex::new(HashMap::new()),
            recent: tokio::sync::Mutex::new(VecDeque::new()),
        })
    }

    /// Waits until one more request fits in the rate limit.
    async fn slot(&self) {
        let mut recent = self.recent.lock().await;
        loop {
            let now = Instant::now();
            while recent
                .front()
                .is_some_and(|t| now.duration_since(*t) > RATE_WINDOW)
            {
                recent.pop_front();
            }
            if recent.len() < RATE_MAX {
                recent.push_back(now);
                return;
            }
            let wait = RATE_WINDOW.saturating_sub(now.duration_since(recent[0]));
            tokio::time::sleep(wait + Duration::from_millis(10)).await;
        }
    }

    /// `Ok(None)`: Deezer has no such item.
    async fn get<T: DeserializeOwned>(&self, path: &str) -> Result<Option<T>> {
        let url = format!("{}{path}", self.base);
        let cached = self.cache.lock().ok().and_then(|c| {
            c.get(&url)
                .filter(|(at, _)| at.elapsed() < CACHE_TTL)
                .map(|(_, v)| v.clone())
        });
        let value = match cached {
            Some(v) => v,
            None => {
                self.slot().await;
                let res = self.http.get(&url).send().await.context("deezer request")?;
                if res.status() == reqwest::StatusCode::NOT_FOUND {
                    return Ok(None);
                }
                let v: Value = res
                    .error_for_status()?
                    .json()
                    .await
                    .context("deezer answer")?;
                if let Some(err) = v.get("error") {
                    // 800: no data; a private playlist answers as if it needed an account.
                    if err["code"].as_i64() == Some(800) || err["type"] == "OAuthException" {
                        return Ok(None);
                    }
                    bail!("deezer error: {err}");
                }
                if let Ok(mut cache) = self.cache.lock() {
                    if cache.len() >= CACHE_MAX {
                        cache.retain(|_, (at, _)| at.elapsed() < CACHE_TTL);
                        if cache.len() >= CACHE_MAX {
                            cache.clear();
                        }
                    }
                    cache.insert(url, (Instant::now(), v.clone()));
                }
                v
            }
        };
        Ok(Some(
            serde_json::from_value(value).context("deezer object")?,
        ))
    }

    fn query(q: &str) -> String {
        url_encode(q)
    }

    pub async fn search_tracks(&self, q: &str, limit: i64) -> Result<Vec<DzTrack>> {
        let path = format!("/search/track?q={}&limit={limit}", Self::query(q));
        Ok(self
            .get::<DzList<DzTrack>>(&path)
            .await?
            .unwrap_or_default()
            .data)
    }

    pub async fn search_albums(&self, q: &str, limit: i64) -> Result<Vec<DzAlbum>> {
        let path = format!("/search/album?q={}&limit={limit}", Self::query(q));
        Ok(self
            .get::<DzList<DzAlbum>>(&path)
            .await?
            .unwrap_or_default()
            .data)
    }

    pub async fn search_artists(&self, q: &str, limit: i64) -> Result<Vec<DzArtist>> {
        let path = format!("/search/artist?q={}&limit={limit}", Self::query(q));
        Ok(self
            .get::<DzList<DzArtist>>(&path)
            .await?
            .unwrap_or_default()
            .data)
    }

    pub async fn track(&self, id: u64) -> Result<Option<DzTrack>> {
        self.get(&format!("/track/{id}")).await
    }

    /// An album with its tracks (in order, positions filled in).
    pub async fn album(&self, id: u64) -> Result<Option<DzAlbum>> {
        let Some(mut album) = self.get::<DzAlbum>(&format!("/album/{id}")).await? else {
            return Ok(None);
        };
        for (i, t) in album.tracks.data.iter_mut().enumerate() {
            t.track_position.get_or_insert(i as i64 + 1);
        }
        Ok(Some(album))
    }

    pub async fn artist(&self, id: u64) -> Result<Option<DzArtist>> {
        self.get(&format!("/artist/{id}")).await
    }

    pub async fn artist_albums(&self, id: u64) -> Result<Vec<DzAlbum>> {
        let path = format!("/artist/{id}/albums?limit=100");
        Ok(self
            .get::<DzList<DzAlbum>>(&path)
            .await?
            .unwrap_or_default()
            .data)
    }

    pub async fn artist_top(&self, id: u64, limit: i64) -> Result<Vec<DzTrack>> {
        let path = format!("/artist/{id}/top?limit={limit}");
        Ok(self
            .get::<DzList<DzTrack>>(&path)
            .await?
            .unwrap_or_default()
            .data)
    }

    /// A public playlist (`None`: no such playlist, or a private one).
    pub async fn playlist(&self, id: u64) -> Result<Option<DzPlaylist>> {
        self.get(&format!("/playlist/{id}")).await
    }

    /// Up to `max` songs of a playlist, in order, read 100 at a time.
    pub async fn playlist_tracks(&self, id: u64, max: usize) -> Result<Vec<DzTrack>> {
        let mut out: Vec<DzTrack> = Vec::new();
        while out.len() < max {
            let path = format!("/playlist/{id}/tracks?index={}&limit=100", out.len());
            let page = self
                .get::<DzList<DzTrack>>(&path)
                .await?
                .unwrap_or_default();
            let n = page.data.len();
            out.extend(page.data);
            if n == 0 || page.total.is_some_and(|t| out.len() as i64 >= t) {
                break;
            }
        }
        out.truncate(max);
        Ok(out)
    }

    /// Where a Deezer short link (`link.deezer.com/s/…`, `deezer.page.link/…`) leads.
    pub async fn follow(&self, url: &str) -> Result<String> {
        let res = self.http.get(url).send().await.context("deezer link")?;
        Ok(res.url().to_string())
    }

    /// Downloads a picture (covers, artist photos) from Deezer's image servers.
    pub async fn picture(&self, url: &str) -> Result<Vec<u8>> {
        // Pictures come from Deezer's https image servers (or from the API itself, in tests).
        if !url.starts_with("https://") && !url.starts_with(&self.base) {
            bail!("not an https picture url");
        }
        let res = self.http.get(url).send().await?.error_for_status()?;
        Ok(res.bytes().await?.to_vec())
    }
}

fn url_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_queries() {
        assert_eq!(url_encode("sigur rós & co"), "sigur%20r%C3%B3s%20%26%20co");
    }

    #[test]
    fn credited_artists_have_no_duplicates() {
        let a = |id, name: &str| DzArtist {
            id,
            name: name.into(),
            ..Default::default()
        };
        let t = DzTrack {
            artist: Some(a(1, "Daft Punk")),
            contributors: vec![a(1, "Daft Punk"), a(2, "Pharrell Williams")],
            ..Default::default()
        };
        let names: Vec<&str> = t.artists().iter().map(|a| a.name.as_str()).collect();
        assert_eq!(names, ["Daft Punk", "Pharrell Williams"]);
    }
}
