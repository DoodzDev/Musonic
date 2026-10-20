//! Audio for tracks without a file: asking the providers, in order, through the shared segment
//! cache. Used to play (`stream`) and to import.

use std::{collections::HashMap, path::PathBuf, sync::Arc};

use anyhow::Result;
use rusqlite::OptionalExtension;

use crate::{
    db::Db,
    providers::{AudioProvider, ProviderHealth, Quality, TrackQuery},
    stream::{AudioSession, SessionManager},
};

/// What opening needs, cheap to clone.
#[derive(Clone)]
pub struct Remote {
    pub db: Db,
    pub providers: Arc<Vec<Arc<dyn AudioProvider>>>,
    pub sessions: Arc<SessionManager>,
    pub health: Arc<ProviderHealth>,
    /// Temporary stream files.
    pub tmp: PathBuf,
}

/// Quality asked of providers to play: lower on a limited bit rate (mobile data).
pub fn wanted_quality(max_bit_rate: i64) -> Quality {
    match max_bit_rate {
        1..=192 => Quality::Mp3_128,
        _ => Quality::Mp3_320,
    }
}

/// What the providers get to find a track, and its ids per catalog.
pub async fn track_query(
    db: &Db,
    id: &str,
) -> Result<Option<(TrackQuery, HashMap<String, String>)>> {
    let id = id.to_owned();
    db.call(move |c| {
        let Some(mut q) = c
            .query_row(
                "SELECT t.title, t.duration_ms, t.isrc, al.title FROM track t
                   LEFT JOIN album al ON al.id = t.album_id WHERE t.id = ?1",
                [&id],
                |r| {
                    Ok(TrackQuery {
                        provider_id: None,
                        title: r.get(0)?,
                        duration: r.get::<_, i64>(1)? / 1000,
                        isrc: r.get(2)?,
                        album: r.get(3)?,
                        artists: Vec::new(),
                    })
                },
            )
            .optional()?
        else {
            return Ok(None);
        };
        q.artists = c
            .prepare_cached(
                "SELECT ar.name FROM track_artist ta JOIN artist ar ON ar.id = ta.artist_id
                  WHERE ta.track_id = ?1 AND ta.role = 'artist' ORDER BY ta.position",
            )?
            .query_map([&id], |r| r.get(0))?
            .collect::<rusqlite::Result<_>>()?;
        let sources = c
            .prepare_cached("SELECT provider, provider_id FROM track_source WHERE track_id = ?1")?
            .query_map([&id], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<rusqlite::Result<_>>()?;
        Ok(Some((q, sources)))
    })
    .await
}

/// The track's audio from the first provider that has it (only providers whose files may be
/// imported when `for_import`), shared with other readers of the same track and quality.
/// Returns the session and the provider that served it.
pub async fn open(
    r: &Remote,
    id: &str,
    wanted: Quality,
    for_import: bool,
) -> Result<Option<(Arc<AudioSession>, &'static str)>> {
    let providers: Vec<Arc<dyn AudioProvider>> = r
        .providers
        .iter()
        .filter(|p| !for_import || p.imports())
        .cloned()
        .collect();
    if providers.is_empty() {
        return Ok(None);
    }
    let Some((query, sources)) = track_query(&r.db, id).await? else {
        return Ok(None);
    };
    let key = format!(
        "{id}\u{1f}{wanted:?}{}",
        if for_import { "\u{1f}import" } else { "" }
    );
    let served_by = Arc::new(std::sync::Mutex::new(""));
    let (tmp, health, canonical, by) = (
        r.tmp.clone(),
        r.health.clone(),
        id.to_owned(),
        served_by.clone(),
    );
    let session = r
        .sessions
        .get_or_open(&key, || async move {
            for p in &providers {
                let mut q = query.clone();
                q.provider_id = p.namespace().and_then(|ns| sources.get(ns)).cloned();
                match p.open(&q, wanted).await {
                    Ok(Some(audio)) => {
                        health.record(p.id(), None);
                        tracing::debug!(track = %canonical, provider = p.id(), "stream opened");
                        if let Ok(mut b) = by.lock() {
                            *b = p.id();
                        }
                        return AudioSession::create(&canonical, audio, &tmp).map(Some);
                    }
                    Ok(None) => health.record(p.id(), None),
                    Err(e) => {
                        tracing::warn!(provider = p.id(), "cannot open {}: {e:#}", q.title);
                        health.record(p.id(), Some(&e));
                    }
                }
            }
            Ok(None)
        })
        .await?;
    let provider = served_by.lock().map(|b| *b).unwrap_or("");
    Ok(session.map(|s| (s, provider)))
}
