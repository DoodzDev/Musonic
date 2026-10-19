//! Conformance checks every [`AudioProvider`] should pass, the way the server will use it:
//! segment-aligned reads, a clamped last segment, stable bytes across reads, `Ok(None)` for a
//! track it does not have. Run them from a provider's own tests:
//!
//! ```ignore
//! let report = conformance::check(&provider, &known_track, &unknown_track).await?;
//! assert!(report.passed(), "{report}");
//! ```

use std::fmt;

use anyhow::Result;

use super::{AudioProvider, Quality, TrackQuery};
use crate::stream::SEGMENT_SIZE;

/// Result of each check, in order.
#[derive(Debug, Default)]
pub struct Report {
    pub checks: Vec<(&'static str, Result<(), String>)>,
}

impl Report {
    pub fn passed(&self) -> bool {
        self.checks.iter().all(|(_, r)| r.is_ok())
    }

    fn push(&mut self, name: &'static str, result: Result<(), String>) {
        self.checks.push((name, result));
    }
}

impl fmt::Display for Report {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for (name, result) in &self.checks {
            match result {
                Ok(()) => writeln!(f, "ok    {name}")?,
                Err(e) => writeln!(f, "FAIL  {name}: {e}")?,
            }
        }
        Ok(())
    }
}

/// Runs every check. `known` must be a track the provider can serve, `unknown` one it cannot.
/// Only network or setup errors come back as `Err`; contract violations are in the report.
pub async fn check(
    provider: &dyn AudioProvider,
    known: &TrackQuery,
    unknown: &TrackQuery,
) -> Result<Report> {
    let mut report = Report::default();

    report.push(
        "unknown track gives Ok(None)",
        match provider.open(unknown, Quality::Flac).await {
            Ok(None) => Ok(()),
            Ok(Some(_)) => Err("served a track it should not have".into()),
            Err(e) => Err(format!("error instead of None: {e:#}")),
        },
    );

    let audio = match provider.open(known, Quality::Flac).await {
        Ok(Some(a)) => {
            report.push("known track opens", Ok(()));
            a
        }
        Ok(None) => {
            report.push("known track opens", Err("returned None".into()));
            return Ok(report);
        }
        Err(e) => {
            report.push("known track opens", Err(format!("{e:#}")));
            return Ok(report);
        }
    };

    report.push(
        "size is not zero",
        if audio.size > 0 {
            Ok(())
        } else {
            Err("size 0".into())
        },
    );

    let first_end = SEGMENT_SIZE.min(audio.size) - 1;
    let first = audio.fetcher.fetch(0, first_end).await;
    report.push(
        "first segment has the exact length",
        match &first {
            Ok(b) if b.len() as u64 == first_end + 1 => Ok(()),
            Ok(b) => Err(format!("{} bytes instead of {}", b.len(), first_end + 1)),
            Err(e) => Err(format!("{e:#}")),
        },
    );

    let last_start = (audio.size - 1) / SEGMENT_SIZE * SEGMENT_SIZE;
    report.push(
        "last segment is clamped to the size",
        match audio.fetcher.fetch(last_start, audio.size - 1).await {
            Ok(b) if b.len() as u64 == audio.size - last_start => Ok(()),
            Ok(b) => Err(format!(
                "{} bytes instead of {}",
                b.len(),
                audio.size - last_start
            )),
            Err(e) => Err(format!("{e:#}")),
        },
    );

    report.push(
        "the same range gives the same bytes",
        match (first, audio.fetcher.fetch(0, first_end).await) {
            (Ok(a), Ok(b)) if a == b => Ok(()),
            (Ok(_), Ok(_)) => Err("bytes differ between two reads".into()),
            (_, Err(e)) | (Err(e), _) => Err(format!("{e:#}")),
        },
    );

    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::{AudioFormat, MemoryProvider};

    fn query(id: &str) -> TrackQuery {
        TrackQuery {
            provider_id: Some(id.into()),
            title: "t".into(),
            ..Default::default()
        }
    }

    #[tokio::test]
    async fn memory_provider_conforms() {
        let data: Vec<u8> = (0..SEGMENT_SIZE * 2 + 77)
            .map(|i| (i % 253) as u8)
            .collect();
        let p = MemoryProvider::default().with("a", data, AudioFormat::Mp3, Quality::Mp3_320);
        let report = check(&p, &query("a"), &query("missing")).await.unwrap();
        assert!(report.passed(), "{report}");
        assert_eq!(report.checks.len(), 6);
    }

    #[tokio::test]
    async fn reports_a_provider_that_serves_everything() {
        struct Greedy(MemoryProvider);
        #[async_trait::async_trait]
        impl AudioProvider for Greedy {
            fn id(&self) -> &'static str {
                "greedy"
            }
            async fn open(
                &self,
                _: &TrackQuery,
                wanted: Quality,
            ) -> Result<Option<super::super::RemoteAudio>> {
                self.0.open(&query("a"), wanted).await
            }
        }
        let p = Greedy(MemoryProvider::default().with(
            "a",
            vec![1u8; 10],
            AudioFormat::Mp3,
            Quality::Mp3_128,
        ));
        let report = check(&p, &query("a"), &query("missing")).await.unwrap();
        assert!(!report.passed());
        assert!(
            report
                .to_string()
                .contains("FAIL  unknown track gives Ok(None)")
        );
    }
}
