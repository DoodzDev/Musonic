//! Rendered answers of the read-only routes, kept until the database changes.
//!
//! Every write goes through the single connection of [`crate::db::Db`], whose change counter
//! ([`crate::db::Db::changes`]) moves on each insert, update or delete: an answer rendered at
//! one count is still right while the count stays the same. Answers depend on the account
//! (likes, ratings, rights), so the account is part of the key.

use std::{
    collections::{HashMap, VecDeque},
    io::Write,
    sync::Mutex,
};

use bytes::Bytes;

use super::Params;
use crate::online::OnlineId;

/// Rendered answers kept at most (bytes).
const BUDGET: usize = 8 * 1024 * 1024;
/// A larger answer is not kept.
const LARGEST: usize = 2 * 1024 * 1024;

/// A smaller answer is not compressed.
const COMPRESS_FROM: usize = 1024;

/// A rendered answer, and its gzip version once made ([`Answer::compressed`]).
#[derive(Clone)]
pub struct Answer {
    pub content_type: &'static str,
    pub body: Bytes,
    pub gzip: Option<Bytes>,
    /// HTTP entity tag: a hash of the body, so a client that has it gets `304 Not Modified`.
    /// Weak: the same for the gzip and plain versions.
    pub etag: String,
}

impl Answer {
    pub fn new(content_type: &'static str, body: Bytes) -> Self {
        let hash = blake3::hash(&body);
        Self {
            content_type,
            etag: format!("W/\"{}\"", &hash.to_hex()[..20]),
            body,
            gzip: None,
        }
    }

    /// The gzip version at the best level: slow (a few milliseconds for a large answer), so
    /// made in the background once the answer is sent, then served to every client after.
    pub fn compressed(&self) -> Option<Bytes> {
        if self.body.len() < COMPRESS_FROM {
            return None;
        }
        let mut e = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::best());
        e.write_all(&self.body).ok()?;
        e.finish().ok().map(Bytes::from)
    }

    fn size(&self) -> usize {
        self.body.len() + self.gzip.as_ref().map_or(0, Bytes::len)
    }
}

/// Credentials and client details: they do not change the answer.
const IGNORED: [&str; 7] = ["u", "p", "t", "s", "apiKey", "c", "v"];

#[derive(Default)]
pub struct AnswerCache {
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    /// Database change count the answers were rendered at.
    changes: u64,
    entries: HashMap<String, Answer>,
    /// Keys from oldest to newest, for eviction.
    order: VecDeque<String>,
    bytes: usize,
}

impl AnswerCache {
    /// The key of a cacheable request, or `None` when its answer must be computed each time.
    pub fn key(user_id: &str, endpoint: &str, params: &Params, online: bool) -> Option<String> {
        let local_id = || {
            params
                .get("id")
                .is_none_or(|id| OnlineId::parse(id).is_none())
        };
        let cacheable = match endpoint {
            "getArtists" | "getIndexes" | "getMusicFolders" | "getGenres" | "getStarred"
            | "getStarred2" | "getPlaylists" | "getSongsByGenre" | "getMusonicLibrary" => true,
            "getAlbum" | "getArtist" | "getSong" | "getPlaylist" | "getMusicDirectory" => {
                local_id()
            }
            "getAlbumList" | "getAlbumList2" => params.get("type") != Some("random"),
            // Without the online catalog, a search reads only the database.
            "search2" | "search3" => !online,
            _ => false,
        };
        if !cacheable {
            return None;
        }
        let mut kept: Vec<_> = params
            .0
            .iter()
            .filter(|(k, _)| !IGNORED.contains(&k.as_str()))
            .collect();
        kept.sort();
        let mut key = format!("{user_id}\u{1f}{endpoint}");
        for (k, v) in kept {
            key.push('\u{1f}');
            key.push_str(k);
            key.push('=');
            key.push_str(v);
        }
        Some(key)
    }

    pub fn get(&self, key: &str, changes: u64) -> Option<Answer> {
        let inner = self.inner.lock().ok()?;
        if inner.changes != changes {
            return None;
        }
        inner.entries.get(key).cloned()
    }

    /// Adds the gzip version of a kept answer, if it is still the same one.
    pub fn add_gzip(&self, key: &str, changes: u64, body: &Bytes, gzip: Bytes) {
        let Ok(mut inner) = self.inner.lock() else {
            return;
        };
        if inner.changes != changes {
            return;
        }
        let added = gzip.len();
        if let Some(a) = inner.entries.get_mut(key)
            && a.gzip.is_none()
            && a.body == *body
        {
            a.gzip = Some(gzip);
            inner.bytes += added;
        }
    }

    pub fn put(&self, key: String, changes: u64, answer: Answer) {
        if answer.body.len() > LARGEST {
            return;
        }
        let Ok(mut inner) = self.inner.lock() else {
            return;
        };
        if inner.changes != changes {
            if changes < inner.changes {
                // Rendered before a change that another answer already saw: stale.
                return;
            }
            *inner = Inner {
                changes,
                ..Default::default()
            };
        }
        let size = key.len() + answer.size();
        if let Some(old) = inner.entries.insert(key.clone(), answer) {
            inner.bytes -= key.len() + old.size();
            inner.order.retain(|k| k != &key);
        }
        inner.bytes += size;
        inner.order.push_back(key);
        while inner.bytes > BUDGET {
            let Some(oldest) = inner.order.pop_front() else {
                break;
            };
            if let Some(old) = inner.entries.remove(&oldest) {
                inner.bytes -= oldest.len() + old.size();
            }
        }
    }
}

/// A value computed from the library, kept while [`crate::db::Db::library_changes`] stays the
/// same (likes, plays and playlists do not move it).
pub struct Snapshot<T> {
    inner: Mutex<Option<(u64, std::sync::Arc<T>)>>,
}

impl<T> Default for Snapshot<T> {
    fn default() -> Self {
        Self {
            inner: Mutex::default(),
        }
    }
}

impl<T> Snapshot<T> {
    pub fn get(&self, version: u64) -> Option<std::sync::Arc<T>> {
        let inner = self.inner.lock().ok()?;
        inner
            .as_ref()
            .filter(|(v, _)| *v == version)
            .map(|(_, t)| t.clone())
    }

    /// Keeps `value`, computed at `version`, unless a newer one is already kept.
    pub fn put(&self, version: u64, value: std::sync::Arc<T>) {
        if let Ok(mut inner) = self.inner.lock()
            && inner.as_ref().is_none_or(|(v, _)| *v <= version)
        {
            *inner = Some((version, value));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn params(q: &str) -> Params {
        Params::parse(Some(q), &[])
    }

    fn json(body: &'static [u8]) -> Answer {
        Answer::new("application/json", Bytes::from_static(body))
    }

    #[test]
    fn compressed_once() {
        let small = json(b"{}");
        assert!(small.compressed().is_none());
        let body = Bytes::from("{\"a\":1}".repeat(500));
        let big = Answer::new("application/json", body.clone());
        let gz = big.compressed().unwrap();
        let cache = AnswerCache::default();
        cache.put("k".into(), 1, big.clone());
        cache.add_gzip("k", 1, &body, gz.clone());
        assert_eq!(cache.get("k", 1).unwrap().gzip.as_ref(), Some(&gz));
        assert!(gz.len() < body.len() / 10);
        let mut out = String::new();
        std::io::Read::read_to_string(&mut flate2::read::GzDecoder::new(&gz[..]), &mut out)
            .unwrap();
        assert_eq!(out.as_bytes(), &body[..]);
    }

    #[test]
    fn keys() {
        let a = AnswerCache::key("u1", "getAlbum", &params("id=x&u=a&t=1&s=2&f=json"), true);
        let b = AnswerCache::key(
            "u1",
            "getAlbum",
            &params("f=json&s=9&t=8&u=a&id=x&c=app"),
            true,
        );
        assert_eq!(a, b, "credentials, client and order ignored");
        assert_ne!(
            a,
            AnswerCache::key("u2", "getAlbum", &params("id=x&f=json"), true)
        );
        assert_ne!(
            a,
            AnswerCache::key("u1", "getAlbum", &params("id=x&f=xml"), true)
        );
        assert!(AnswerCache::key("u1", "getAlbum", &params("id=dz-album-1"), true).is_none());
        assert!(AnswerCache::key("u1", "getAlbumList2", &params("type=random"), true).is_none());
        assert!(AnswerCache::key("u1", "getRandomSongs", &params(""), true).is_none());
        assert!(AnswerCache::key("u1", "search3", &params("query=a"), true).is_none());
        assert!(AnswerCache::key("u1", "search3", &params("query=a"), false).is_some());
        assert!(AnswerCache::key("u1", "star", &params("id=x"), false).is_none());
    }

    #[test]
    fn kept_until_a_change() {
        let cache = AnswerCache::default();
        cache.put("k".into(), 5, json(b"{}"));
        assert!(cache.get("k", 5).is_some());
        assert!(cache.get("k", 6).is_none(), "the database changed");
        cache.put("k".into(), 4, json(b"old"));
        assert!(
            cache.get("k", 5).is_some(),
            "an older answer does not replace a newer one"
        );
        cache.put("j".into(), 6, json(b"{}"));
        assert!(cache.get("k", 6).is_none(), "cleared on a change");
        assert!(cache.get("j", 6).is_some());
    }

    #[test]
    fn budget() {
        let cache = AnswerCache::default();
        let big = Answer::new("application/json", Bytes::from(vec![b' '; LARGEST]));
        for i in 0..10 {
            cache.put(format!("k{i}"), 1, big.clone());
        }
        let inner = cache.inner.lock().unwrap();
        assert!(inner.bytes <= BUDGET);
        assert!(inner.entries.contains_key("k9"), "newest kept");
        assert!(!inner.entries.contains_key("k0"), "oldest evicted");
    }
}
