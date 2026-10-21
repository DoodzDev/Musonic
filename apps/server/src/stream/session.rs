//! Disk-backed segment cache shared by every listener of the same track.
//!
//! The remote file is split in 1 MiB segments; each segment is fetched once (concurrent readers
//! wait for the same fetch), written at its offset in a sparse temp file, and the next segments are
//! prefetched in the background. Memory use stays flat whatever the file size.

use std::{
    collections::HashMap,
    os::unix::fs::FileExt,
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex as StdMutex,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
    time::{Duration, Instant},
};

use anyhow::{Context, Result, ensure};
use bytes::Bytes;
use futures_util::{StreamExt, stream};
use tokio::sync::{Mutex, OnceCell};

use crate::{
    model::{AudioFormat, Quality},
    providers::{RangeFetcher, RemoteAudio},
};

pub const SEGMENT_SIZE: u64 = 1024 * 1024;
const PREFETCH: usize = 2;
const DOWNLOAD_PARALLELISM: usize = 4;
const IDLE_EVICTION: Duration = Duration::from_secs(600);

pub struct AudioSession {
    pub canonical_id: String,
    pub size: u64,
    pub format: AudioFormat,
    pub quality: Quality,
    fetcher: Arc<dyn RangeFetcher>,
    path: PathBuf,
    file: Arc<std::fs::File>,
    segments: Vec<OnceCell<()>>,
    filled: AtomicUsize,
    last_access: StdMutex<Instant>,
    downloading: AtomicBool,
}

impl AudioSession {
    pub fn create(canonical_id: &str, remote: RemoteAudio, tmp_dir: &Path) -> Result<Arc<Self>> {
        ensure!(remote.size > 0, "empty audio file");
        std::fs::create_dir_all(tmp_dir)?;
        let path = tmp_dir.join(format!(
            "{}.{}.part",
            uuid::Uuid::new_v4(),
            remote.format.extension()
        ));
        let file = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .create_new(true)
            .open(&path)?;
        file.set_len(remote.size)?;
        let count = remote.size.div_ceil(SEGMENT_SIZE) as usize;
        Ok(Arc::new(Self {
            canonical_id: canonical_id.to_owned(),
            size: remote.size,
            format: remote.format,
            quality: remote.quality,
            fetcher: remote.fetcher,
            path,
            file: Arc::new(file),
            segments: (0..count).map(|_| OnceCell::new()).collect(),
            filled: AtomicUsize::new(0),
            last_access: StdMutex::new(Instant::now()),
            downloading: AtomicBool::new(false),
        }))
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn is_complete(&self) -> bool {
        self.filled.load(Ordering::Acquire) == self.segments.len()
    }

    fn touch(&self) {
        if let Ok(mut t) = self.last_access.lock() {
            *t = Instant::now();
        }
    }

    async fn ensure(&self, idx: usize) -> Result<()> {
        self.segments[idx]
            .get_or_try_init(|| async {
                let start = idx as u64 * SEGMENT_SIZE;
                let end = (start + SEGMENT_SIZE).min(self.size) - 1;
                let data = self.fetcher.fetch(start, end).await?;
                ensure!(
                    data.len() as u64 == end - start + 1,
                    "short segment {idx}: {} bytes",
                    data.len()
                );
                let file = self.file.clone();
                tokio::task::spawn_blocking(move || file.write_all_at(&data, start)).await??;
                self.filled.fetch_add(1, Ordering::AcqRel);
                Ok(())
            })
            .await
            .map(|_| ())
    }

    fn prefetch(self: &Arc<Self>, from: usize) {
        for idx in from..(from + PREFETCH).min(self.segments.len()) {
            if self.segments[idx].initialized() {
                continue;
            }
            let this = self.clone();
            tokio::spawn(async move {
                if let Err(e) = this.ensure(idx).await {
                    tracing::debug!("prefetch segment {idx} failed: {e:#}");
                }
            });
        }
    }

    /// Reads `[start, start+len)` (clamped to the file), fetching missing segments.
    pub async fn read(self: &Arc<Self>, start: u64, len: u64) -> Result<Bytes> {
        self.touch();
        let end = (start + len).min(self.size);
        if start >= end {
            return Ok(Bytes::new());
        }
        let first = (start / SEGMENT_SIZE) as usize;
        let last = ((end - 1) / SEGMENT_SIZE) as usize;
        for idx in first..=last {
            self.ensure(idx).await?;
        }
        self.prefetch(last + 1);
        let file = self.file.clone();
        let buf = tokio::task::spawn_blocking(move || -> std::io::Result<Vec<u8>> {
            let mut buf = vec![0; (end - start) as usize];
            file.read_exact_at(&mut buf, start)?;
            Ok(buf)
        })
        .await??;
        Ok(Bytes::from(buf))
    }

    /// Downloads every missing segment. Returns once the whole file is on disk.
    pub async fn download_all(self: &Arc<Self>) -> Result<()> {
        let results: Vec<Result<()>> = stream::iter(0..self.segments.len())
            .map(|idx| {
                let this = self.clone();
                async move { this.ensure(idx).await }
            })
            .buffer_unordered(DOWNLOAD_PARALLELISM)
            .collect()
            .await;
        for r in results {
            r?;
        }
        ensure!(self.is_complete(), "download incomplete");
        Ok(())
    }

    /// Marks the session as downloading; returns false if it already was.
    pub fn claim_download(&self) -> bool {
        !self.downloading.swap(true, Ordering::AcqRel)
    }

    /// Copies the complete file to `dest` (the session keeps serving from its own file).
    pub async fn copy_to(&self, dest: &Path) -> Result<()> {
        ensure!(self.is_complete(), "copy of an incomplete file");
        tokio::fs::copy(&self.path, dest)
            .await
            .with_context(|| format!("copy to {}", dest.display()))?;
        Ok(())
    }

    fn idle_for(&self) -> Duration {
        self.last_access
            .lock()
            .map(|t| t.elapsed())
            .unwrap_or_default()
    }
}

impl Drop for AudioSession {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

#[derive(Debug, thiserror::Error)]
#[error("no audio source")]
struct NoSource;

/// One session per canonical track, created once even under concurrent requests.
#[derive(Default)]
pub struct SessionManager {
    sessions: Mutex<HashMap<String, Arc<OnceCell<Arc<AudioSession>>>>>,
}

impl SessionManager {
    pub async fn get(&self, canonical_id: &str) -> Option<Arc<AudioSession>> {
        self.sessions
            .lock()
            .await
            .get(canonical_id)
            .and_then(|c| c.get().cloned())
    }

    pub async fn get_or_open<F, Fut>(
        &self,
        canonical_id: &str,
        open: F,
    ) -> Result<Option<Arc<AudioSession>>>
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = Result<Option<Arc<AudioSession>>>>,
    {
        let cell = self
            .sessions
            .lock()
            .await
            .entry(canonical_id.to_owned())
            .or_default()
            .clone();
        let res = cell
            .get_or_try_init(|| async { open().await?.ok_or_else(|| anyhow::Error::new(NoSource)) })
            .await
            .cloned();
        match res {
            Ok(s) => Ok(Some(s)),
            Err(e) => {
                let mut map = self.sessions.lock().await;
                if map.get(canonical_id).is_some_and(|c| c.get().is_none()) {
                    map.remove(canonical_id);
                }
                if e.is::<NoSource>() { Ok(None) } else { Err(e) }
            }
        }
    }

    /// Drops sessions nobody used for a while (and that are not downloading).
    pub async fn evict_idle(&self) -> usize {
        let mut map = self.sessions.lock().await;
        let before = map.len();
        map.retain(|_, cell| match cell.get() {
            Some(s) => {
                let busy = s.downloading.load(Ordering::Acquire) && !s.is_complete();
                busy || Arc::strong_count(s) > 1 || s.idle_for() < IDLE_EVICTION
            }
            None => true,
        });
        before - map.len()
    }

    /// Drops every session nobody reads now (their files go with them): the console's « empty
    /// the cache ».
    pub async fn clear_unused(&self) -> usize {
        let mut map = self.sessions.lock().await;
        let before = map.len();
        map.retain(|_, cell| match cell.get() {
            Some(s) => {
                (s.downloading.load(Ordering::Acquire) && !s.is_complete())
                    || Arc::strong_count(s) > 1
            }
            None => true,
        });
        before - map.len()
    }

    pub async fn count(&self) -> usize {
        self.sessions.lock().await.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;
    use std::sync::atomic::AtomicU32;

    struct Fake {
        data: Vec<u8>,
        calls: AtomicU32,
    }

    #[async_trait]
    impl RangeFetcher for Fake {
        async fn fetch(&self, start: u64, end: u64) -> Result<Bytes> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            tokio::time::sleep(Duration::from_millis(5)).await;
            Ok(Bytes::copy_from_slice(
                &self.data[start as usize..=end as usize],
            ))
        }
    }

    fn session(size: usize) -> (Arc<AudioSession>, Arc<Fake>) {
        let data: Vec<u8> = (0..size).map(|i| (i % 251) as u8).collect();
        let fake = Arc::new(Fake {
            data,
            calls: AtomicU32::new(0),
        });
        let remote = RemoteAudio {
            size: size as u64,
            format: AudioFormat::Mp3,
            quality: Quality::Mp3_128,
            fetcher: fake.clone(),
        };
        let dir = std::env::temp_dir().join("musonic-server-tests");
        (AudioSession::create("t", remote, &dir).unwrap(), fake)
    }

    #[tokio::test]
    async fn reads_ranges_across_segments() {
        let size = (SEGMENT_SIZE * 3 + 1234) as usize;
        let (s, fake) = session(size);
        let start = SEGMENT_SIZE - 10;
        let got = s.read(start, 30).await.unwrap();
        assert_eq!(&got[..], &fake.data[start as usize..start as usize + 30]);
        let tail = s.read(size as u64 - 5, 100).await.unwrap();
        assert_eq!(tail.len(), 5);
        assert!(s.read(size as u64, 10).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn concurrent_readers_fetch_each_segment_once() {
        let size = (SEGMENT_SIZE * 2) as usize;
        let (s, fake) = session(size);
        let reads = (0..16).map(|_| {
            let s = s.clone();
            async move { s.read(0, SEGMENT_SIZE * 2).await.unwrap() }
        });
        for r in futures_util::future::join_all(reads).await {
            assert_eq!(r.len(), size);
        }
        assert_eq!(fake.calls.load(Ordering::SeqCst), 2);
        s.download_all().await.unwrap();
        assert!(s.is_complete());
        let path = s.path().to_owned();
        drop(s);
        assert!(!path.exists(), "temp file removed on drop");
    }
}
