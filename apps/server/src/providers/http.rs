//! Audio at an HTTP(S) address, read by byte ranges: shared by the providers that relay a file
//! from another server (an OctoFiesta / Subsonic server, a preview…).

use std::sync::Arc;

use anyhow::{Context, Result, bail, ensure};
use async_trait::async_trait;
use bytes::Bytes;
use reqwest::{StatusCode, header};

use super::{AudioFormat, Quality, RangeFetcher, RemoteAudio, memory::BytesFetcher};

/// Reads ranges with `Range` requests.
struct RangedFetcher {
    http: reqwest::Client,
    url: String,
}

#[async_trait]
impl RangeFetcher for RangedFetcher {
    async fn fetch(&self, start: u64, end: u64) -> Result<Bytes> {
        let res = self
            .http
            .get(&self.url)
            .header(header::RANGE, format!("bytes={start}-{end}"))
            .send()
            .await?;
        ensure!(
            res.status() == StatusCode::PARTIAL_CONTENT,
            "range {start}-{end}: HTTP {}",
            res.status()
        );
        let data = res.bytes().await?;
        ensure!(
            data.len() as u64 == end - start + 1,
            "range {start}-{end}: {} bytes",
            data.len()
        );
        Ok(data)
    }
}

/// `bytes 0-0/12345` → 12345.
fn total_size(content_range: &str) -> Option<u64> {
    content_range.rsplit('/').next()?.trim().parse().ok()
}

/// Opens the audio at `url`. A server that answers ranges is read segment by segment; one that
/// does not is read whole, once (fine for songs, a few MB). `Ok(None)`: no such file there.
pub async fn open_url(
    http: &reqwest::Client,
    url: &str,
    format: AudioFormat,
    quality: Quality,
) -> Result<Option<RemoteAudio>> {
    let res = http
        .get(url)
        .header(header::RANGE, "bytes=0-0")
        .send()
        .await
        .context("audio request")?;
    let status = res.status();
    if status == StatusCode::NOT_FOUND {
        return Ok(None);
    }
    let is_audio = res
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_none_or(|t| !t.starts_with("application/json") && !t.contains("xml"));
    if !is_audio {
        // Subsonic servers answer errors (not found…) as JSON or XML with a 200.
        return Ok(None);
    }
    let (size, fetcher): (u64, Arc<dyn RangeFetcher>) = match status {
        StatusCode::PARTIAL_CONTENT => {
            let size = res
                .headers()
                .get(header::CONTENT_RANGE)
                .and_then(|v| v.to_str().ok())
                .and_then(total_size)
                .context("partial answer without its total size")?;
            (
                size,
                Arc::new(RangedFetcher {
                    http: http.clone(),
                    url: url.to_owned(),
                }),
            )
        }
        s if s.is_success() => {
            let data = res.bytes().await.context("audio body")?;
            (data.len() as u64, Arc::new(BytesFetcher(data)))
        }
        s => bail!("audio request: HTTP {s}"),
    };
    if size == 0 {
        return Ok(None);
    }
    Ok(Some(RemoteAudio {
        size,
        format,
        quality,
        fetcher,
    }))
}

#[cfg(test)]
mod tests {
    use super::total_size;

    #[test]
    fn reads_the_total_size() {
        assert_eq!(total_size("bytes 0-0/4213"), Some(4213));
        assert_eq!(total_size("bytes 0-0/*"), None);
    }
}
