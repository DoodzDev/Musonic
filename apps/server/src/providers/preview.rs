//! Last resort: the 30-second preview Deezer's public API gives for every track. Plays something
//! for online tracks when no other provider has them.

use std::sync::Arc;

use anyhow::Result;
use async_trait::async_trait;

use super::{AudioFormat, AudioProvider, Quality, RemoteAudio, TrackQuery, http::open_url};
use crate::online::{DEEZER, Deezer};

pub struct DeezerPreview {
    deezer: Arc<Deezer>,
    http: reqwest::Client,
}

impl DeezerPreview {
    pub fn new(deezer: Arc<Deezer>) -> Self {
        Self {
            deezer,
            http: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl AudioProvider for DeezerPreview {
    fn id(&self) -> &'static str {
        "deezer-preview"
    }

    fn namespace(&self) -> Option<&'static str> {
        Some(DEEZER)
    }

    async fn open(&self, track: &TrackQuery, _wanted: Quality) -> Result<Option<RemoteAudio>> {
        let Some(id) = track.provider_id.as_deref().and_then(|i| i.parse().ok()) else {
            return Ok(None);
        };
        let Some(url) = self.deezer.track(id).await?.and_then(|t| t.preview) else {
            return Ok(None);
        };
        if url.is_empty() {
            return Ok(None);
        }
        open_url(&self.http, &url, AudioFormat::Mp3, Quality::Mp3_128).await
    }
}
