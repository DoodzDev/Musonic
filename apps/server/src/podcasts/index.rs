//! Podcast Index (podcastindex.org), the open directory: shows the iTunes directory misses or
//! gives without their feed (Radio France…), and episodes by person (host or guest). Needs a
//! free key, set by an administrator ([`super::Podcasts::set_index`]).

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::{Result, bail};
use serde::Serialize;
use serde_json::Value;
use sha1::{Digest, Sha1};

use super::Found;

const API: &str = "https://api.podcastindex.org/api/1.0";
const WAIT: Duration = Duration::from_secs(8);

#[derive(Clone)]
pub struct Key {
    pub key: String,
    pub secret: String,
}

/// An episode found by person or topic, opened through its show.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FoundEpisode {
    pub title: String,
    pub show_title: String,
    pub feed_url: String,
    /// The item's `guid` in its feed: gives its episode id once the show is read.
    pub guid: Option<String>,
    pub image_url: Option<String>,
    pub published_at: Option<i64>,
    pub duration_s: Option<i64>,
}

/// One request, signed as the API asks: SHA-1 of key + secret + time.
async fn get(
    http: &reqwest::Client,
    key: &Key,
    path: &str,
    params: &[(&str, &str)],
) -> Result<Value> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)?
        .as_secs()
        .to_string();
    let hash = hex::encode(Sha1::digest(format!("{}{}{now}", key.key, key.secret)));
    let res = http
        .get(format!("{API}{path}"))
        .query(params)
        .header("X-Auth-Key", &key.key)
        .header("X-Auth-Date", &now)
        .header("Authorization", hash)
        .timeout(WAIT)
        .send()
        .await
        .map_err(reqwest::Error::without_url)?;
    if res.status() == reqwest::StatusCode::UNAUTHORIZED {
        bail!("Podcast Index refused the key");
    }
    let body: Value = res
        .error_for_status()
        .map_err(reqwest::Error::without_url)?
        .json()
        .await?;
    if body["status"] == "false" || body["status"] == false {
        bail!(
            "Podcast Index: {}",
            body["description"].as_str().unwrap_or("error")
        );
    }
    Ok(body)
}

fn text(v: &Value, k: &str) -> Option<String> {
    v[k].as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
}

fn found(feed: &Value) -> Option<Found> {
    // Dead feeds (no reply for a long time) are left out.
    if feed["dead"].as_i64().unwrap_or(0) != 0 {
        return None;
    }
    Some(Found {
        feed_url: text(feed, "url")?,
        title: text(feed, "title")?,
        author: text(feed, "author").or_else(|| text(feed, "ownerName")),
        image_url: text(feed, "artwork").or_else(|| text(feed, "image")),
        genre: feed["categories"]
            .as_object()
            .and_then(|c| c.values().next())
            .and_then(Value::as_str)
            .map(str::to_owned),
        episode_count: feed["episodeCount"].as_i64(),
    })
}

/// Shows whose title, author or owner match.
pub async fn shows(
    http: &reqwest::Client,
    key: &Key,
    query: &str,
    max: usize,
) -> Result<Vec<Found>> {
    let max = max.to_string();
    let body = get(
        http,
        key,
        "/search/byterm",
        &[("q", query), ("max", &max), ("clean", "")],
    )
    .await?;
    Ok(body["feeds"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default()
        .iter()
        .filter_map(found)
        .collect())
}

/// Episodes where a person speaks (host or guest), newest first.
pub async fn episodes_with(
    http: &reqwest::Client,
    key: &Key,
    person: &str,
    max: usize,
) -> Result<Vec<FoundEpisode>> {
    let max = max.to_string();
    let body = get(
        http,
        key,
        "/search/byperson",
        &[("q", person), ("max", &max)],
    )
    .await?;
    Ok(body["items"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default()
        .iter()
        .filter_map(|e| {
            Some(FoundEpisode {
                title: text(e, "title")?,
                show_title: text(e, "feedTitle").unwrap_or_default(),
                feed_url: text(e, "feedUrl")?,
                guid: text(e, "guid"),
                image_url: text(e, "image").or_else(|| text(e, "feedImage")),
                published_at: e["datePublished"].as_i64(),
                duration_s: e["duration"].as_i64().filter(|d| *d > 0),
            })
        })
        .collect())
}

/// The feed of a show the iTunes directory lists without it.
pub async fn feed_of_itunes_id(
    http: &reqwest::Client,
    key: &Key,
    itunes_id: i64,
) -> Result<Option<String>> {
    let id = itunes_id.to_string();
    let body = get(http, key, "/podcasts/byitunesid", &[("id", &id)]).await?;
    Ok(text(&body["feed"], "url"))
}

/// Same show in both directories: compared without scheme, `www.` or final slash.
pub fn same_feed(a: &str, b: &str) -> bool {
    fn bare(url: &str) -> String {
        let url = url.trim().to_ascii_lowercase();
        let url = url
            .split_once("://")
            .map_or(url.as_str(), |(_, rest)| rest)
            .to_owned();
        url.trim_start_matches("www.")
            .trim_end_matches('/')
            .to_owned()
    }
    bare(a) == bare(b)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn feeds_compare_loosely() {
        assert!(same_feed(
            "https://www.example.org/feed/",
            "http://example.org/feed"
        ));
        assert!(!same_feed("https://example.org/a", "https://example.org/b"));
    }

    #[test]
    fn dead_feeds_are_left_out() {
        let alive = serde_json::json!({"url": "https://e.org/f", "title": "Show", "author": "A", "dead": 0, "categories": {"55": "News"}});
        assert_eq!(found(&alive).unwrap().genre.as_deref(), Some("News"));
        assert!(
            found(&serde_json::json!({"url": "https://e.org/f", "title": "Show", "dead": 1}))
                .is_none()
        );
    }
}
