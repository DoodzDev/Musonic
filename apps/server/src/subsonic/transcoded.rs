//! Transcoded songs kept on disk (`<data_dir>/cache/transcoded`): a song played again, on
//! another device or after a skip back, is sent at once as a file (with HTTP ranges, so seeking
//! works), instead of starting ffmpeg again.
//!
//! A song is written while it is sent, and kept only when ffmpeg finished it; the oldest ones
//! go when the folder is over its size (`transcode_cache_mb`).

use std::{
    io::Write,
    path::{Path, PathBuf},
    pin::Pin,
    task::{Context, Poll},
    time::SystemTime,
};

use bytes::Bytes;
use sha2::{Digest, Sha256};
use tokio_util::io::ReaderStream;

/// Where the transcoded songs are.
pub fn dir(data_dir: &Path) -> PathBuf {
    data_dir.join("cache").join("transcoded")
}

/// The file of a song transcoded from `source` (its size and date: a new file is another song)
/// to `target` at `kbps`.
pub fn path(data_dir: &Path, source: &Path, target: &str, kbps: i64) -> PathBuf {
    let stamp = std::fs::metadata(source)
        .map(|m| {
            let at = m
                .modified()
                .ok()
                .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                .map_or(0, |d| d.as_secs());
            format!("{}\u{1f}{at}", m.len())
        })
        .unwrap_or_default();
    let key = hex::encode(Sha256::digest(format!(
        "{}\u{1f}{stamp}\u{1f}{target}\u{1f}{kbps}",
        source.display()
    )));
    dir(data_dir)
        .join(&key[..2])
        .join(format!("{key}.{target}"))
}

/// A kept song, marked as just used (the oldest unused go first).
pub fn find(path: &Path) -> Option<u64> {
    let file = std::fs::File::options().write(true).open(path).ok()?;
    let _ = file.set_modified(SystemTime::now());
    file.metadata().ok().map(|m| m.len())
}

/// Removes the least recently used songs until the folder fits in `budget` bytes.
pub fn trim(data_dir: &Path, budget: u64) {
    let mut files: Vec<(SystemTime, u64, PathBuf)> = Vec::new();
    let Ok(groups) = std::fs::read_dir(dir(data_dir)) else {
        return;
    };
    for group in groups.filter_map(Result::ok) {
        let Ok(entries) = std::fs::read_dir(group.path()) else {
            continue;
        };
        for e in entries.filter_map(Result::ok) {
            if let Ok(m) = e.metadata()
                && m.is_file()
            {
                files.push((
                    m.modified().unwrap_or(SystemTime::UNIX_EPOCH),
                    m.len(),
                    e.path(),
                ));
            }
        }
    }
    let mut total: u64 = files.iter().map(|f| f.1).sum();
    files.sort();
    for (_, size, path) in files {
        if total <= budget {
            break;
        }
        if std::fs::remove_file(&path).is_ok() {
            total -= size;
        }
    }
}

/// ffmpeg's output, sent to the client and written to the cache: kept when ffmpeg ends well,
/// dropped when the client goes away first or ffmpeg fails.
pub struct Tee {
    /// Taken at the end of the output (its exit is awaited then); dropped with the stream
    /// otherwise, which kills it.
    child: Option<tokio::process::Child>,
    inner: ReaderStream<tokio::process::ChildStdout>,
    file: Option<(std::fs::File, PathBuf)>,
    dest: PathBuf,
    data_dir: PathBuf,
    budget: u64,
}

impl Tee {
    pub fn new(
        mut child: tokio::process::Child,
        chunk: usize,
        dest: PathBuf,
        data_dir: PathBuf,
        budget: u64,
    ) -> Self {
        let stdout = child.stdout.take().expect("piped");
        let file = (budget > 0)
            .then(|| {
                let tmp = dest.with_extension(format!("part{}", std::process::id()));
                std::fs::create_dir_all(tmp.parent()?).ok()?;
                std::fs::File::create(&tmp).ok().map(|f| (f, tmp))
            })
            .flatten();
        Self {
            child: Some(child),
            inner: ReaderStream::with_capacity(stdout, chunk),
            file,
            dest,
            data_dir,
            budget,
        }
    }

    /// The output ended: the file is kept once ffmpeg exits well.
    fn finish(&mut self) {
        let (Some(mut child), Some((file, tmp))) = (self.child.take(), self.file.take()) else {
            return;
        };
        drop(file);
        let (dest, data_dir, budget) = (self.dest.clone(), self.data_dir.clone(), self.budget);
        tokio::spawn(async move {
            let done = child.wait().await.is_ok_and(|s| s.success());
            if done && std::fs::rename(&tmp, &dest).is_ok() {
                let _ = tokio::task::spawn_blocking(move || trim(&data_dir, budget)).await;
            } else {
                let _ = std::fs::remove_file(&tmp);
            }
        });
    }
}

impl futures_util::Stream for Tee {
    type Item = std::io::Result<Bytes>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let this = &mut *self;
        match Pin::new(&mut this.inner).poll_next(cx) {
            Poll::Ready(Some(Ok(bytes))) => {
                if let Some((file, _)) = &mut this.file
                    && file.write_all(&bytes).is_err()
                {
                    // A full disk: the song is sent, not kept.
                    if let Some((_, tmp)) = this.file.take() {
                        let _ = std::fs::remove_file(tmp);
                    }
                }
                Poll::Ready(Some(Ok(bytes)))
            }
            Poll::Ready(None) => {
                this.finish();
                Poll::Ready(None)
            }
            other => other,
        }
    }
}

impl Drop for Tee {
    fn drop(&mut self) {
        // The client went away before the end: nothing kept (the child is killed on drop).
        if let Some((_, tmp)) = self.file.take() {
            let _ = std::fs::remove_file(tmp);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_oldest_go_first() {
        let data = crate::testing::temp_dir("transcoded");
        let d = dir(&data).join("ab");
        std::fs::create_dir_all(&d).unwrap();
        for (i, name) in ["old", "mid", "new"].iter().enumerate() {
            let p = d.join(name);
            std::fs::write(&p, vec![0u8; 1000]).unwrap();
            let f = std::fs::File::options().write(true).open(&p).unwrap();
            f.set_modified(
                SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(1000 + i as u64),
            )
            .unwrap();
        }
        assert_eq!(find(&d.join("old")), Some(1000), "used now: the newest");
        trim(&data, 2000);
        assert!(d.join("old").exists());
        assert!(!d.join("mid").exists());
        assert!(d.join("new").exists());
    }

    #[test]
    fn another_file_is_another_song() {
        let data = crate::testing::temp_dir("transcoded-key");
        let song = data.join("a.flac");
        std::fs::write(&song, b"one").unwrap();
        let a = path(&data, &song, "mp3", 128);
        assert_ne!(a, path(&data, &song, "mp3", 96));
        assert_ne!(a, path(&data, &song, "opus", 128));
        std::fs::write(&song, b"other").unwrap();
        assert_ne!(a, path(&data, &song, "mp3", 128), "the file changed");
    }
}
