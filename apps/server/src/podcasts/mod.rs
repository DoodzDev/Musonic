//! Podcasts (ADR-023): shows read from their RSS feed, found through the iTunes directory.
//! Shows and episodes are shared by every account; subscriptions and positions are per account.
//!
//! - [`feed`]: reading a feed.
//! - [`Podcasts::subscribe`] reads a feed once and follows it for the account;
//!   [`Podcasts::refresh`] reads it again, sending `If-None-Match` / `If-Modified-Since` so
//!   an unchanged feed costs one short answer.
//! - [`Podcasts::search`]: the iTunes directory (no key needed), kept a day.

pub mod feed;
pub mod net;

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use anyhow::{Context, Result, bail};
use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;

use crate::{db::Db, ids};

/// Feeds larger than this are refused (a few have every episode since 2005: still < 10 MB).
const FEED_MAX_BYTES: usize = 20 * 1024 * 1024;
/// Show pictures are often 3000 × 3000: a few MB, never this much.
const PICTURE_MAX_BYTES: usize = 15 * 1024 * 1024;
const SEARCH_KEPT: Duration = Duration::from_secs(24 * 3600);
const SEARCH_RESULTS: usize = 25;

#[derive(Clone)]
pub struct Podcasts {
    db: Db,
    http: reqwest::Client,
    /// Directory searches, by query (the directory changes slowly).
    searches: Arc<Mutex<HashMap<String, Searched>>>,
    directory_url: String,
}

/// When a search was made, and what it found.
type Searched = (Instant, Vec<Found>);

/// A show found in the directory, not yet followed.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Found {
    pub feed_url: String,
    pub title: String,
    pub author: Option<String>,
    pub image_url: Option<String>,
    pub genre: Option<String>,
    pub episode_count: Option<i64>,
}

impl Podcasts {
    pub fn new(db: Db) -> Result<Self> {
        Self::with_directory(db, "https://itunes.apple.com/search")
    }

    /// The directory at another address, for tests.
    pub fn with_directory(db: Db, directory_url: &str) -> Result<Self> {
        Ok(Self {
            db,
            http: reqwest::Client::builder()
                .user_agent(concat!(
                    "MusonicServer/",
                    env!("CARGO_PKG_VERSION"),
                    " (podcasts)"
                ))
                .timeout(Duration::from_secs(20))
                .redirect(net::redirect_policy())
                .build()?,
            searches: Arc::default(),
            directory_url: directory_url.to_owned(),
        })
    }

    /// The client used for feeds and episodes (same limits: timeout, redirects).
    pub fn http(&self) -> &reqwest::Client {
        &self.http
    }

    /// A show's or an episode's picture, from its host.
    pub async fn picture(&self, url: &str) -> Result<Vec<u8>> {
        let url = reqwest::Url::parse(url)?;
        net::check(&url).await?;
        let res = self
            .http
            .get(url)
            .send()
            .await
            .map_err(reqwest::Error::without_url)?;
        let res = res
            .error_for_status()
            .map_err(reqwest::Error::without_url)?;
        if res
            .content_length()
            .is_some_and(|n| n as usize > PICTURE_MAX_BYTES)
        {
            bail!("picture too large");
        }
        let bytes = res.bytes().await.map_err(reqwest::Error::without_url)?;
        if bytes.len() > PICTURE_MAX_BYTES {
            bail!("picture too large");
        }
        Ok(bytes.to_vec())
    }

    /// Shows matching `query` in the iTunes directory. `country`: the store to search
    /// (two letters, `fr`…), where local shows are listed.
    pub async fn search(&self, query: &str, country: Option<&str>) -> Result<Vec<Found>> {
        let query = query.trim();
        if query.is_empty() {
            return Ok(Vec::new());
        }
        let country = country
            .filter(|c| c.len() == 2 && c.chars().all(|ch| ch.is_ascii_alphabetic()))
            .map(str::to_ascii_lowercase);
        let key = format!(
            "{}\u{1f}{}",
            country.as_deref().unwrap_or(""),
            query.to_lowercase()
        );
        if let Some((at, found)) = self.searches.lock().unwrap().get(&key)
            && at.elapsed() < SEARCH_KEPT
        {
            return Ok(found.clone());
        }
        let mut url = reqwest::Url::parse(&self.directory_url)?;
        url.query_pairs_mut()
            .append_pair("media", "podcast")
            .append_pair("entity", "podcast")
            .append_pair("limit", &SEARCH_RESULTS.to_string())
            .append_pair("term", query);
        if let Some(c) = &country {
            url.query_pairs_mut().append_pair("country", c);
        }
        let body: serde_json::Value = self
            .http
            .get(url)
            .send()
            .await
            .map_err(reqwest::Error::without_url)?
            .error_for_status()
            .map_err(reqwest::Error::without_url)?
            .json()
            .await
            .map_err(reqwest::Error::without_url)?;
        let text = |v: &serde_json::Value, k: &str| {
            v[k].as_str()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_owned)
        };
        let found: Vec<Found> = body["results"]
            .as_array()
            .map(Vec::as_slice)
            .unwrap_or_default()
            .iter()
            .filter_map(|r| {
                Some(Found {
                    feed_url: text(r, "feedUrl")?,
                    title: text(r, "collectionName")?,
                    author: text(r, "artistName"),
                    image_url: text(r, "artworkUrl600").or_else(|| text(r, "artworkUrl100")),
                    genre: text(r, "primaryGenreName"),
                    episode_count: r["trackCount"].as_i64(),
                })
            })
            .collect();
        self.searches
            .lock()
            .unwrap()
            .insert(key, (Instant::now(), found.clone()));
        Ok(found)
    }

    /// Follows the show at `feed_url` for `user` (read at once when new). Returns its id.
    pub async fn subscribe(&self, user: &str, feed_url: &str) -> Result<String> {
        let feed_url = feed_url.trim();
        let parsed = reqwest::Url::parse(feed_url).context("feed address")?;
        net::check(&parsed).await?;
        let id = ids::podcast_id(feed_url);
        let known = {
            let id = id.clone();
            self.db
                .call(move |c| {
                    Ok(
                        c.query_row("SELECT 1 FROM podcast WHERE id = ?1", [&id], |_| Ok(()))
                            .optional()?
                            .is_some(),
                    )
                })
                .await?
        };
        if !known {
            self.read(&id, feed_url, None, None).await?;
        }
        let (user, podcast) = (user.to_owned(), id.clone());
        self.db
            .call(move |c| {
                c.execute(
                    "INSERT OR IGNORE INTO podcast_subscription(user_id, podcast_id) VALUES (?1, ?2)",
                    params![user, podcast],
                )?;
                Ok(())
            })
            .await?;
        Ok(id)
    }

    /// Stops following; the show stays while someone else follows it.
    pub async fn unsubscribe(&self, user: &str, podcast_id: &str) -> Result<bool> {
        let (user, id) = (user.to_owned(), podcast_id.to_owned());
        self.db
            .call(move |c| {
                let n = c.execute(
                    "DELETE FROM podcast_subscription WHERE user_id = ?1 AND podcast_id = ?2",
                    params![user, id],
                )?;
                c.execute(
                    "DELETE FROM podcast WHERE id = ?1
                       AND NOT EXISTS (SELECT 1 FROM podcast_subscription WHERE podcast_id = ?1)",
                    [&id],
                )?;
                Ok(n > 0)
            })
            .await
    }

    /// Reads a followed show's feed again (conditional request). Failures are kept on the
    /// show (`error`) and returned.
    pub async fn refresh(&self, podcast_id: &str) -> Result<()> {
        let id = podcast_id.to_owned();
        let row: Option<(String, Option<String>, Option<String>)> = self
            .db
            .call(move |c| {
                Ok(c.query_row(
                    "SELECT feed_url, etag, last_modified FROM podcast WHERE id = ?1",
                    [&id],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
                )
                .optional()?)
            })
            .await?;
        let Some((url, etag, modified)) = row else {
            bail!("no such podcast");
        };
        self.read(podcast_id, &url, etag.as_deref(), modified.as_deref())
            .await
    }

    /// Every show someone follows, one after the other (feeds are small, hosts are many).
    pub async fn refresh_all(&self) -> usize {
        let ids: Vec<String> = self
            .db
            .call(|c| {
                let mut st = c.prepare("SELECT DISTINCT podcast_id FROM podcast_subscription")?;
                let ids = st
                    .query_map([], |r| r.get(0))?
                    .collect::<rusqlite::Result<_>>()?;
                Ok(ids)
            })
            .await
            .unwrap_or_default();
        let mut failed = 0;
        for id in &ids {
            if let Err(e) = self.refresh(id).await {
                failed += 1;
                tracing::warn!("podcast {id}: {e:#}");
            }
        }
        ids.len() - failed
    }

    async fn read(
        &self,
        id: &str,
        url: &str,
        etag: Option<&str>,
        modified: Option<&str>,
    ) -> Result<()> {
        let result = self.fetch(url, etag, modified).await;
        let (id, url) = (id.to_owned(), url.to_owned());
        match result {
            Ok(None) => {
                self.db
                    .call(move |c| {
                        c.execute(
                        "UPDATE podcast SET checked_at = unixepoch(), error = NULL WHERE id = ?1",
                        [&id],
                    )?;
                        Ok(())
                    })
                    .await
            }
            Ok(Some((show, etag, modified))) => {
                self.db
                    .call(move |c| {
                        let tx = c.transaction()?;
                        store(&tx, &id, &url, &show, etag.as_deref(), modified.as_deref())?;
                        tx.commit()?;
                        Ok(())
                    })
                    .await
            }
            Err(e) => {
                let message = format!("{e:#}");
                let _ = self
                    .db
                    .call(move |c| {
                        c.execute(
                            "UPDATE podcast SET checked_at = unixepoch(), error = ?2 WHERE id = ?1",
                            params![id, message],
                        )?;
                        Ok(())
                    })
                    .await;
                Err(e)
            }
        }
    }

    /// The feed, or `None` when it has not changed since `etag` / `modified`.
    async fn fetch(
        &self,
        url: &str,
        etag: Option<&str>,
        modified: Option<&str>,
    ) -> Result<Option<(feed::Show, Option<String>, Option<String>)>> {
        let parsed = reqwest::Url::parse(url)?;
        net::check(&parsed).await?;
        let mut req = self.http.get(parsed);
        if let Some(e) = etag {
            req = req.header(reqwest::header::IF_NONE_MATCH, e);
        }
        if let Some(m) = modified {
            req = req.header(reqwest::header::IF_MODIFIED_SINCE, m);
        }
        let res = req.send().await.map_err(reqwest::Error::without_url)?;
        if res.status() == reqwest::StatusCode::NOT_MODIFIED {
            return Ok(None);
        }
        let res = res
            .error_for_status()
            .map_err(reqwest::Error::without_url)?;
        let header = |name| {
            res.headers()
                .get(name)
                .and_then(|v| v.to_str().ok())
                .map(str::to_owned)
        };
        let (etag, modified) = (
            header(reqwest::header::ETAG),
            header(reqwest::header::LAST_MODIFIED),
        );
        if res
            .content_length()
            .is_some_and(|n| n as usize > FEED_MAX_BYTES)
        {
            bail!("feed too large");
        }
        let bytes = res.bytes().await.map_err(reqwest::Error::without_url)?;
        if bytes.len() > FEED_MAX_BYTES {
            bail!("feed too large");
        }
        let text = String::from_utf8_lossy(&bytes);
        let show = feed::parse(&text)?;
        Ok(Some((show, etag, modified)))
    }
}

/// Writes a show and its episodes. Episodes already known keep their downloaded copy.
pub fn store(
    c: &Connection,
    id: &str,
    feed_url: &str,
    show: &feed::Show,
    etag: Option<&str>,
    modified: Option<&str>,
) -> Result<()> {
    c.execute(
        "INSERT INTO podcast(id, feed_url, title, author, description, image_url, link, language,
                             etag, last_modified, checked_at, error, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, unixepoch(), NULL, unixepoch())
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title, author = excluded.author, description = excluded.description,
           image_url = excluded.image_url, link = excluded.link, language = excluded.language,
           etag = excluded.etag, last_modified = excluded.last_modified,
           checked_at = unixepoch(), error = NULL, updated_at = unixepoch()",
        params![
            id,
            feed_url,
            show.title,
            show.author,
            show.description,
            show.image_url,
            show.link,
            show.language,
            etag,
            modified
        ],
    )?;
    let mut st = c.prepare_cached(
        "INSERT INTO episode(id, podcast_id, guid, title, description, published_at, duration_s,
                             audio_url, audio_size, audio_type, image_url, chapters_url, transcript_url)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title, description = excluded.description,
           published_at = excluded.published_at, duration_s = excluded.duration_s,
           audio_url = excluded.audio_url, audio_size = excluded.audio_size,
           audio_type = excluded.audio_type, image_url = excluded.image_url,
           chapters_url = excluded.chapters_url, transcript_url = excluded.transcript_url",
    )?;
    for e in &show.episodes {
        st.execute(params![
            ids::episode_id(id, &e.guid),
            id,
            e.guid,
            e.title,
            e.description,
            e.published_at,
            e.duration_s,
            e.audio_url,
            e.audio_size,
            e.audio_type,
            e.image_url,
            e.chapters_url,
            e.transcript_url
        ])?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn a_show_is_stored_once_and_its_episodes_keep_their_ids() {
        let db = Db::memory().unwrap();
        let show = feed::Show {
            title: "Rock Stories".into(),
            episodes: vec![feed::Item {
                guid: "ep-1".into(),
                title: "One".into(),
                audio_url: "https://cdn.example.org/1.mp3".into(),
                ..Default::default()
            }],
            ..Default::default()
        };
        let id = ids::podcast_id("https://example.org/feed.xml");
        assert!(id.starts_with("pc-"));
        let (id2, mut show2) = (id.clone(), show.clone());
        show2.episodes[0].title = "One (new title)".into();
        db.call(move |c| {
            store(
                c,
                &id2,
                "https://example.org/feed.xml",
                &show,
                Some("\"v1\""),
                None,
            )?;
            store(
                c,
                &id2,
                "https://example.org/feed.xml",
                &show2,
                Some("\"v2\""),
                None,
            )?;
            Ok(())
        })
        .await
        .unwrap();
        let (n, title, etag): (i64, String, String) = db
            .call(|c| {
                Ok(c.query_row(
                    "SELECT count(*), e.title, p.etag FROM episode e JOIN podcast p ON p.id = e.podcast_id",
                    [],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
                )?)
            })
            .await
            .unwrap();
        assert_eq!(
            (n, title.as_str(), etag.as_str()),
            (1, "One (new title)", "\"v2\"")
        );
        assert_eq!(ids::episode_id(&id, "ep-1"), ids::episode_id(&id, "ep-1"));
        assert!(ids::episode_id(&id, "ep-1").starts_with("pe-"));
    }

    /// Against the real iTunes directory and a real feed: `cargo test -- --ignored podcasts`.
    #[tokio::test]
    #[ignore = "network"]
    async fn real_directory_and_feed() {
        let db = Db::memory().unwrap();
        db.call(|c| {
            c.execute(
                "INSERT INTO user(id, username, password_hash) VALUES ('u1', 'Doodz', 'x')",
                [],
            )?;
            Ok(())
        })
        .await
        .unwrap();
        let podcasts = Podcasts::new(db.clone()).unwrap();
        let found = podcasts
            .search("Michael Jackson", Some("fr"))
            .await
            .unwrap();
        assert!(!found.is_empty(), "the directory answers");
        let started = Instant::now();
        let id = podcasts.subscribe("u1", &found[0].feed_url).await.unwrap();
        let read_ms = started.elapsed().as_millis();
        let n: i64 = db
            .call(move |c| {
                Ok(c.query_row(
                    "SELECT count(*) FROM episode WHERE podcast_id = ?1",
                    [&id],
                    |r| r.get(0),
                )?)
            })
            .await
            .unwrap();
        eprintln!("{}: {n} episodes, read in {read_ms} ms", found[0].title);
        assert!(n > 0);
    }
}
