//! A provider serving files held in memory: for tests, and as the smallest example of the
//! [`AudioProvider`] contract.

use std::{collections::HashMap, sync::Arc};

use anyhow::{Result, ensure};
use async_trait::async_trait;
use bytes::Bytes;

use super::{AudioFormat, AudioProvider, Quality, RangeFetcher, RemoteAudio, TrackQuery};

struct BytesFetcher(Bytes);

#[async_trait]
impl RangeFetcher for BytesFetcher {
    async fn fetch(&self, start: u64, end: u64) -> Result<Bytes> {
        let size = self.0.len() as u64;
        ensure!(
            start <= end && end < size,
            "range {start}-{end} outside 0-{}",
            size.saturating_sub(1)
        );
        Ok(self.0.slice(start as usize..=end as usize))
    }
}

/// Serves the files it was given, looked up by provider id.
#[derive(Default)]
pub struct MemoryProvider {
    files: HashMap<String, (Bytes, AudioFormat, Quality)>,
}

impl MemoryProvider {
    pub fn with(
        mut self,
        provider_id: &str,
        data: impl Into<Bytes>,
        format: AudioFormat,
        quality: Quality,
    ) -> Self {
        self.files
            .insert(provider_id.to_owned(), (data.into(), format, quality));
        self
    }
}

#[async_trait]
impl AudioProvider for MemoryProvider {
    fn id(&self) -> &'static str {
        "memory"
    }

    fn namespace(&self) -> Option<&'static str> {
        Some("memory")
    }

    async fn open(&self, track: &TrackQuery, wanted: Quality) -> Result<Option<RemoteAudio>> {
        let Some((data, format, quality)) =
            track.provider_id.as_ref().and_then(|id| self.files.get(id))
        else {
            return Ok(None);
        };
        if *quality > wanted || data.is_empty() {
            return Ok(None);
        }
        Ok(Some(RemoteAudio {
            size: data.len() as u64,
            format: *format,
            quality: *quality,
            fetcher: Arc::new(BytesFetcher(data.clone())),
        }))
    }
}
