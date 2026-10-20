//! Audio providers: the plug through which the server gets audio it does not have as a file.
//!
//! A provider answers one question: "can you serve this track, and how?". It returns the size,
//! format and quality of a file plus a [`RangeFetcher`] that reads any byte range of it. The
//! server does everything else: one canonical id per track, the shared segment cache
//! ([`crate::stream::SessionManager`]), import into the library, tags, covers, rescans.
//!
//! Providers are plain Rust values registered by the binary that starts the server, so a
//! build can add its own next to the ones shipped here. Every provider should pass
//! [`conformance::check`]. See `docs/PROVIDERS.md`.

pub mod conformance;
mod http;
mod memory;
mod preview;
mod subsonic;

use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
};

use anyhow::Result;
use async_trait::async_trait;
use bytes::Bytes;

pub use memory::MemoryProvider;
pub use preview::DeezerPreview;
pub use subsonic::SubsonicProvider;

pub use crate::model::{AudioFormat, Quality};

/// Reads a byte range of a provider's file (already playable bytes).
#[async_trait]
pub trait RangeFetcher: Send + Sync {
    /// `end` is inclusive. The server always asks for ranges aligned on
    /// [`crate::stream::SEGMENT_SIZE`], the last one being clamped to the file size.
    async fn fetch(&self, start: u64, end: u64) -> Result<Bytes>;
}

/// An audio file a provider can serve.
pub struct RemoteAudio {
    /// Exact size in bytes.
    pub size: u64,
    pub format: AudioFormat,
    pub quality: Quality,
    pub fetcher: Arc<dyn RangeFetcher>,
}

/// What the server knows about the track it asks for. A provider uses whatever fits it: its
/// own id when the track came from its catalog, else the metadata (ISRC, title, artists…).
#[derive(Debug, Clone, Default)]
pub struct TrackQuery {
    /// The id of the track in [`AudioProvider::namespace`], when the catalog knows it.
    pub provider_id: Option<String>,
    pub title: String,
    pub artists: Vec<String>,
    pub album: Option<String>,
    pub isrc: Option<String>,
    /// Seconds; 0 when unknown.
    pub duration: i64,
}

/// A source of audio for tracks the library has no file for.
#[async_trait]
pub trait AudioProvider: Send + Sync {
    /// Unique id of this provider, e.g. `import-folder`.
    fn id(&self) -> &'static str;

    /// Catalog whose track ids this provider understands (it then gets them in
    /// [`TrackQuery::provider_id`]), or `None` when it only works from metadata.
    fn namespace(&self) -> Option<&'static str> {
        None
    }

    /// Opens the best quality available up to `wanted`. `Ok(None)` = this provider does not
    /// have the track (the server tries the next one); `Err` = it failed. A provider whose
    /// account or key no longer works returns [`CredentialsExpired`].
    async fn open(&self, track: &TrackQuery, wanted: Quality) -> Result<Option<RemoteAudio>>;

    /// Whether its files may be imported into the library (not a preview, for instance).
    fn imports(&self) -> bool {
        true
    }
}

/// A provider's account or key no longer works: the server shows it as an alert.
#[derive(Debug, thiserror::Error)]
#[error("credentials expired: {0}")]
pub struct CredentialsExpired(pub String);

/// The last problem of each provider, for `/health` and the console.
#[derive(Default)]
pub struct ProviderHealth {
    alerts: Mutex<BTreeMap<&'static str, String>>,
    journal: Option<crate::journal::Journal>,
}

impl ProviderHealth {
    /// Writes in the journal when a provider stops or starts working again.
    pub fn with_journal(journal: crate::journal::Journal) -> Self {
        Self {
            alerts: Mutex::default(),
            journal: Some(journal),
        }
    }

    /// Records how a provider just did: `None` = it worked.
    pub fn record(&self, provider: &'static str, error: Option<&anyhow::Error>) {
        let Ok(mut all) = self.alerts.lock() else {
            return;
        };
        match error {
            None => {
                if all.remove(provider).is_some()
                    && let Some(j) = &self.journal
                {
                    j.log(crate::journal::Entry::new("provider.ok").target(provider));
                }
            }
            Some(e) if e.is::<CredentialsExpired>() => {
                if !all.contains_key(provider) {
                    tracing::error!("provider {provider}: {e:#}; renew its credentials");
                    if let Some(j) = &self.journal {
                        j.log(crate::journal::Entry::new("provider.expired").target(provider));
                    }
                }
                all.insert(provider, "credentials_expired".to_owned());
            }
            Some(_) => {}
        }
    }

    /// Providers with an alert, and which.
    pub fn alerts(&self) -> BTreeMap<&'static str, String> {
        self.alerts.lock().map(|a| a.clone()).unwrap_or_default()
    }
}
