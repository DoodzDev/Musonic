//! Media: `stream`, `download`, `getCoverArt`, `getLyrics`, `getLyricsBySongId`.
//!
//! Streams are the file itself (with HTTP ranges, so players can seek), or a transcoding by
//! ffmpeg when the client asks for a lower bit rate or another format. Without ffmpeg the file
//! is sent as is. Covers come from the album (image file or embedded picture), resized on
//! request and cached on disk.

use std::{
    io::Cursor,
    path::{Path, PathBuf},
    process::Stdio,
};

use axum::{
    body::Body,
    http::{HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use lofty::{file::TaggedFileExt, picture::PictureType, probe::Probe};
use rusqlite::OptionalExtension;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::ReaderStream;

use super::{ApiError, Ctx, Reply, model, one};

/// The playable file of a track: absolute path, format, bit rate (kbit/s), size.
struct AudioFile {
    path: PathBuf,
    format: String,
    bit_rate: Option<i64>,
    size: u64,
}

async fn audio_file(ctx: &Ctx, id: &str) -> Result<AudioFile, ApiError> {
    let id = id.to_owned();
    let found = ctx
        .state
        .db
        .call(move |c| {
            Ok(c.query_row(
                "SELECT l.path, f.path, f.format, f.bit_rate, f.size FROM track_file f
                   JOIN library l ON l.id = f.library_id
                  WHERE f.track_id = ?1 AND f.missing = 0
                  ORDER BY coalesce(f.bit_rate, 0) DESC, f.id LIMIT 1",
                [&id],
                |r| {
                    Ok(AudioFile {
                        path: Path::new(&r.get::<_, String>(0)?).join(r.get::<_, String>(1)?),
                        format: r.get(2)?,
                        bit_rate: r.get(3)?,
                        size: r.get::<_, i64>(4)? as u64,
                    })
                },
            )
            .optional()?)
        })
        .await?;
    found.ok_or_else(|| ApiError::not_found("Song"))
}

/// `bytes=a-b`, `bytes=a-`, `bytes=-n` → (start, end inclusive).
fn parse_range(value: &str, size: u64) -> Option<(u64, u64)> {
    let spec = value.strip_prefix("bytes=")?.split(',').next()?.trim();
    let (a, b) = spec.split_once('-')?;
    let (start, end) = match (a.trim(), b.trim()) {
        ("", n) => {
            let n: u64 = n.parse().ok()?;
            (size.saturating_sub(n), size.checked_sub(1)?)
        }
        (a, "") => (a.parse().ok()?, size.checked_sub(1)?),
        (a, b) => (
            a.parse().ok()?,
            b.parse::<u64>().ok()?.min(size.checked_sub(1)?),
        ),
    };
    (start <= end && start < size).then_some((start, end))
}

/// A file with HTTP range support.
async fn send_file(
    ctx: &Ctx,
    path: &Path,
    content_type: &str,
    size: u64,
    download_name: Option<&str>,
) -> Response {
    let mut file = match tokio::fs::File::open(path).await {
        Ok(f) => f,
        Err(e) => {
            tracing::warn!("cannot open {}: {e}", path.display());
            return StatusCode::NOT_FOUND.into_response();
        }
    };
    let range = ctx
        .headers
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok())
        .map(|v| parse_range(v, size));
    let mut res = match range {
        Some(None) => {
            return (
                StatusCode::RANGE_NOT_SATISFIABLE,
                [(header::CONTENT_RANGE, format!("bytes */{size}"))],
            )
                .into_response();
        }
        Some(Some((start, end))) => {
            if file.seek(std::io::SeekFrom::Start(start)).await.is_err() {
                return StatusCode::INTERNAL_SERVER_ERROR.into_response();
            }
            let len = end - start + 1;
            let mut r = Response::new(Body::from_stream(ReaderStream::new(file.take(len))));
            *r.status_mut() = StatusCode::PARTIAL_CONTENT;
            r.headers_mut().insert(
                header::CONTENT_RANGE,
                HeaderValue::from_str(&format!("bytes {start}-{end}/{size}")).expect("ascii"),
            );
            r.headers_mut().insert(header::CONTENT_LENGTH, len.into());
            r
        }
        None => {
            let mut r = Response::new(Body::from_stream(ReaderStream::new(file)));
            r.headers_mut().insert(header::CONTENT_LENGTH, size.into());
            r
        }
    };
    let h = res.headers_mut();
    h.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    h.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(content_type)
            .unwrap_or(HeaderValue::from_static("application/octet-stream")),
    );
    if let Some(name) = download_name {
        let ascii: String = name
            .chars()
            .map(|c| if c.is_ascii() && c != '"' { c } else { '_' })
            .collect();
        if let Ok(v) = HeaderValue::from_str(&format!("attachment; filename=\"{ascii}\"")) {
            h.insert(header::CONTENT_DISPOSITION, v);
        }
    }
    res
}

/// What the client asked: `format` (`raw` = never transcode), `maxBitRate` (kbit/s, 0 = no limit).
fn transcode_target(
    format: Option<&str>,
    max_bit_rate: i64,
    file_format: &str,
    file_bit_rate: Option<i64>,
) -> Option<(&'static str, i64)> {
    let wanted = match format {
        Some("raw") => return None,
        Some("mp3") => Some("mp3"),
        Some("opus") => Some("opus"),
        Some("aac") | Some("m4a") => Some("aac"),
        Some("ogg") => Some("ogg"),
        _ => None,
    };
    let other_format = wanted.is_some_and(|w| w != file_format);
    let too_big = max_bit_rate > 0 && file_bit_rate.is_none_or(|b| b > max_bit_rate);
    if !other_format && !too_big {
        return None;
    }
    let target = wanted.unwrap_or("mp3");
    let default = match target {
        "opus" => 128,
        "aac" => 256,
        _ => 192,
    };
    let rate = if max_bit_rate > 0 {
        max_bit_rate.min(320)
    } else {
        default
    };
    // Never "upscale" a smaller file.
    let rate = file_bit_rate
        .filter(|b| *b > 0 && *b < rate && !other_format)
        .unwrap_or(rate);
    Some((target, rate))
}

fn ffmpeg_args(path: &Path, target: &str, kbps: i64, offset: i64) -> Vec<String> {
    let mut args: Vec<String> = vec!["-v".into(), "error".into()];
    if offset > 0 {
        args.extend(["-ss".into(), offset.to_string()]);
    }
    args.extend(["-i".into(), path.to_string_lossy().into_owned()]);
    args.extend([
        "-map".into(),
        "0:a:0".into(),
        "-vn".into(),
        "-map_metadata".into(),
        "-1".into(),
    ]);
    let (codec, container) = match target {
        "opus" => ("libopus", "opus"),
        "aac" => ("aac", "adts"),
        "ogg" => ("libvorbis", "ogg"),
        _ => ("libmp3lame", "mp3"),
    };
    args.extend([
        "-c:a".into(),
        codec.into(),
        "-b:a".into(),
        format!("{kbps}k"),
    ]);
    args.extend(["-f".into(), container.into(), "-".into()]);
    args
}

fn ffmpeg_bin() -> String {
    std::env::var("MUSONIC_FFMPEG").unwrap_or_else(|_| "ffmpeg".into())
}

pub async fn stream(ctx: &Ctx, download: bool) -> Result<Response, ApiError> {
    let id = ctx.params.require("id")?.to_owned();
    let file = audio_file(ctx, &id).await?;
    if download {
        let name = file
            .path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned());
        return Ok(send_file(
            ctx,
            &file.path,
            model::content_type(&file.format),
            file.size,
            name.as_deref(),
        )
        .await);
    }
    let max: i64 = ctx
        .params
        .get("maxBitRate")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    let offset: i64 = ctx
        .params
        .get("timeOffset")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    if let Some((target, kbps)) =
        transcode_target(ctx.params.get("format"), max, &file.format, file.bit_rate)
    {
        let spawned = tokio::process::Command::new(ffmpeg_bin())
            .args(ffmpeg_args(&file.path, target, kbps, offset))
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn();
        match spawned {
            Ok(mut child) => {
                let stdout = child.stdout.take().expect("piped");
                // The child is killed when the client goes away (the stream, and it, are dropped).
                let body = Body::from_stream(ChildStream {
                    _child: child,
                    inner: ReaderStream::new(stdout),
                });
                let mime = match target {
                    "opus" => "audio/ogg; codecs=opus",
                    "aac" => "audio/aac",
                    "ogg" => "audio/ogg",
                    _ => "audio/mpeg",
                };
                return Ok(([(header::CONTENT_TYPE, mime)], body).into_response());
            }
            Err(e) => tracing::warn!("ffmpeg unavailable ({e}): sending the file as is"),
        }
    }
    Ok(send_file(
        ctx,
        &file.path,
        model::content_type(&file.format),
        file.size,
        None,
    )
    .await)
}

/// Keeps the ffmpeg process alive exactly as long as its output is being read.
struct ChildStream {
    _child: tokio::process::Child,
    inner: ReaderStream<tokio::process::ChildStdout>,
}

impl futures_util::Stream for ChildStream {
    type Item = std::io::Result<bytes::Bytes>;

    fn poll_next(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Self::Item>> {
        std::pin::Pin::new(&mut self.inner).poll_next(cx)
    }
}

// Covers ----------------------------------------------------------------------------------

/// Where a cover id's picture is (`file:<abs path>` or `embedded:<abs path>`), and a version
/// stamp for the cache.
async fn cover_source(ctx: &Ctx, id: &str) -> Result<Option<(String, PathBuf, i64)>, ApiError> {
    let id = id.to_owned();
    let data_dir = ctx.state.data_dir.clone();
    Ok(ctx
        .state
        .db
        .call(move |c| {
            // A playlist's own cover.
            if let Some(pl) = id.strip_prefix("pl-") {
                let path: Option<String> = c
                    .query_row("SELECT cover_path FROM playlist WHERE id = ?1", [pl], |r| {
                        r.get(0)
                    })
                    .optional()?
                    .flatten();
                return Ok(path.map(|p| ("file".to_owned(), data_dir.join(p), 0)));
            }
            // An album id, or a track id (its album's cover, else its own picture).
            let cover_ref: Option<(String, i64)> = c
                .query_row(
                    "SELECT al.cover_ref, al.updated_at FROM album al
                      WHERE al.id = ?1 OR al.id = (SELECT album_id FROM track WHERE id = ?1)
                      LIMIT 1",
                    [&id],
                    |r| Ok((r.get::<_, Option<String>>(0)?, r.get(1)?)),
                )
                .optional()?
                .and_then(|(r, at)| r.map(|r| (r, at)));
            let cover_ref = match cover_ref {
                Some(c) => Some(c),
                None => c
                    .query_row(
                        "SELECT 'embedded:' || id, updated_at FROM track_file
                          WHERE track_id = ?1 AND has_cover = 1 AND missing = 0 LIMIT 1",
                        [&id],
                        |r| Ok((r.get(0)?, r.get(1)?)),
                    )
                    .optional()?,
            };
            let Some((cover_ref, stamp)) = cover_ref else {
                return Ok(None);
            };
            let root: String =
                c.query_row("SELECT path FROM library ORDER BY id LIMIT 1", [], |r| {
                    r.get(0)
                })?;
            if let Some(rel) = cover_ref.strip_prefix("file:") {
                return Ok(Some(("file".to_owned(), Path::new(&root).join(rel), stamp)));
            }
            if let Some(file_id) = cover_ref.strip_prefix("embedded:") {
                let rel: Option<String> = c
                    .query_row(
                        "SELECT path FROM track_file WHERE id = ?1",
                        [file_id],
                        |r| r.get(0),
                    )
                    .optional()?;
                return Ok(
                    rel.map(|rel| ("embedded".to_owned(), Path::new(&root).join(rel), stamp))
                );
            }
            Ok(None)
        })
        .await?)
}

fn read_picture(kind: &str, path: &Path) -> anyhow::Result<Vec<u8>> {
    if kind == "file" {
        return Ok(std::fs::read(path)?);
    }
    let tagged = Probe::open(path)?.guess_file_type()?.read()?;
    let tag = tagged
        .primary_tag()
        .or_else(|| tagged.first_tag())
        .ok_or_else(|| anyhow::anyhow!("no tag"))?;
    let pic = tag
        .pictures()
        .iter()
        .find(|p| p.pic_type() == PictureType::CoverFront)
        .or_else(|| tag.pictures().first())
        .ok_or_else(|| anyhow::anyhow!("no picture"))?;
    Ok(pic.data().to_vec())
}

fn sniff(data: &[u8]) -> &'static str {
    match data {
        [0x89, b'P', b'N', b'G', ..] => "image/png",
        [
            b'R',
            b'I',
            b'F',
            b'F',
            _,
            _,
            _,
            _,
            b'W',
            b'E',
            b'B',
            b'P',
            ..,
        ] => "image/webp",
        [b'G', b'I', b'F', ..] => "image/gif",
        _ => "image/jpeg",
    }
}

/// Fits the picture in `size` × `size` (never enlarges), as JPEG.
fn resize(data: &[u8], size: u32) -> anyhow::Result<Vec<u8>> {
    let img = image::load_from_memory(data)?;
    if img.width() <= size && img.height() <= size {
        return Ok(data.to_vec());
    }
    let small = img
        .resize(size, size, image::imageops::FilterType::CatmullRom)
        .to_rgb8();
    let mut out = Cursor::new(Vec::new());
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 85).encode_image(&small)?;
    Ok(out.into_inner())
}

pub async fn cover_art(ctx: &Ctx) -> Result<Response, ApiError> {
    let id = ctx.params.require("id")?.to_owned();
    let size: Option<u32> = ctx
        .params
        .get("size")
        .and_then(|v| v.parse().ok())
        .filter(|s| *s > 0 && *s < 4096);
    let Some((kind, path, stamp)) = cover_source(ctx, &id).await? else {
        return Ok(StatusCode::NOT_FOUND.into_response());
    };
    let cache_dir = ctx.state.data_dir.join("cache").join("covers");
    let bytes = tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<u8>> {
        let key = hex::encode(Sha256::digest(format!(
            "{kind}\u{1f}{}\u{1f}{stamp}\u{1f}{size:?}",
            path.display()
        )));
        let cached = cache_dir.join(&key[..2]).join(&key);
        if let Ok(data) = std::fs::read(&cached) {
            return Ok(data);
        }
        let original = read_picture(&kind, &path)?;
        let data = match size {
            Some(s) => resize(&original, s).unwrap_or(original),
            None => original,
        };
        if let Some(dir) = cached.parent() {
            let _ = std::fs::create_dir_all(dir);
            let tmp = cached.with_extension("tmp");
            if std::fs::write(&tmp, &data).is_ok() {
                let _ = std::fs::rename(&tmp, &cached);
            }
        }
        Ok(data)
    })
    .await
    .map_err(anyhow::Error::from)?;
    match bytes {
        Ok(data) => Ok((
            [
                (header::CONTENT_TYPE, sniff(&data)),
                (header::CACHE_CONTROL, "public, max-age=86400"),
            ],
            data,
        )
            .into_response()),
        Err(e) => {
            tracing::debug!("cover {id}: {e:#}");
            Ok(StatusCode::NOT_FOUND.into_response())
        }
    }
}

// Lyrics ----------------------------------------------------------------------------------

/// LRC text → `[(start ms, line)]`; lines without a timestamp are kept with no start.
fn parse_lrc(text: &str) -> Vec<(Option<i64>, String)> {
    let mut out = Vec::new();
    for line in text.lines() {
        let mut rest = line.trim();
        let mut stamps = Vec::new();
        // Leading `[mm:ss.xx]` tags (several for a repeated line); `[ar:…]` metadata stops it.
        while let Some(stripped) = rest.strip_prefix('[') {
            let Some(end) = stripped.find(']') else { break };
            let ms = stripped[..end].split_once(':').and_then(|(m, s)| {
                let m: i64 = m.trim().parse().ok()?;
                let s: f64 = s.trim().parse().ok()?;
                Some(m * 60_000 + (s * 1000.0).round() as i64)
            });
            let Some(ms) = ms else { break };
            stamps.push(ms);
            rest = &stripped[end + 1..];
        }
        let text = rest.trim().to_owned();
        if stamps.is_empty() {
            if !line.trim().is_empty() && !line.trim_start().starts_with('[') {
                out.push((None, line.trim().to_owned()));
            }
        } else {
            out.extend(stamps.into_iter().map(|s| (Some(s), text.clone())));
        }
    }
    out.sort_by_key(|(s, _)| s.unwrap_or(i64::MAX));
    out
}

pub async fn lyrics_by_song_id(ctx: &Ctx) -> Reply {
    let id = ctx.params.require("id")?.to_owned();
    let found = ctx
        .state
        .db
        .call(move |c| {
            Ok(c.query_row(
                "SELECT l.content, l.synced, t.title, t.artist_display FROM lyrics l JOIN track t ON t.id = l.track_id
                  WHERE l.track_id = ?1 AND l.content <> ''",
                [&id],
                |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)? != 0, r.get::<_, String>(2)?, r.get::<_, String>(3)?)),
            )
            .optional()?)
        })
        .await?;
    let list: Vec<Value> = match found {
        Some((content, synced, title, artist)) => {
            let lines: Vec<Value> = if synced {
                parse_lrc(&content)
                    .into_iter()
                    .map(|(s, v)| match s {
                        Some(s) => json!({ "start": s, "value": v }),
                        None => json!({ "value": v }),
                    })
                    .collect()
            } else {
                content.lines().map(|l| json!({ "value": l })).collect()
            };
            vec![json!({
                "displayArtist": artist,
                "displayTitle": title,
                "lang": "xxx",
                "synced": synced,
                "line": lines,
            })]
        }
        None => Vec::new(),
    };
    Ok(one("lyricsList", json!({ "structuredLyrics": list })))
}

pub async fn lyrics(ctx: &Ctx) -> Reply {
    let artist = ctx.params.get("artist").unwrap_or_default().to_owned();
    let title = ctx.params.get("title").unwrap_or_default().to_owned();
    let (norm_title, norm_artist) = (
        crate::matcher::normalize(&title),
        crate::matcher::normalize(&artist),
    );
    let found = ctx
        .state
        .db
        .call(move |c| {
            Ok(c.query_row(
                "SELECT l.content, l.synced, t.artist_display, t.title FROM lyrics l JOIN track t ON t.id = l.track_id
                  WHERE t.norm_title = ?1 AND (?2 = '' OR t.norm_artists LIKE '%' || ?2 || '%') AND l.content <> ''
                  LIMIT 1",
                [norm_title, norm_artist],
                |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)? != 0, r.get::<_, String>(2)?, r.get::<_, String>(3)?)),
            )
            .optional()?)
        })
        .await?;
    Ok(one(
        "lyrics",
        match found {
            Some((content, synced, a, t)) => {
                let text = if synced {
                    parse_lrc(&content)
                        .into_iter()
                        .map(|(_, l)| l)
                        .collect::<Vec<_>>()
                        .join("\n")
                } else {
                    content
                };
                json!({ "artist": a, "title": t, "value": text })
            }
            None => json!({ "artist": artist, "title": title }),
        },
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ranges() {
        assert_eq!(parse_range("bytes=0-99", 1000), Some((0, 99)));
        assert_eq!(parse_range("bytes=900-", 1000), Some((900, 999)));
        assert_eq!(parse_range("bytes=-100", 1000), Some((900, 999)));
        assert_eq!(parse_range("bytes=500-5000", 1000), Some((500, 999)));
        assert_eq!(parse_range("bytes=1000-", 1000), None);
        assert_eq!(parse_range("items=0-1", 1000), None);
    }

    #[test]
    fn transcoding_decisions() {
        // Original quality asked, or file already small enough: no transcoding.
        assert_eq!(transcode_target(None, 0, "mp3", Some(320)), None);
        assert_eq!(transcode_target(None, 192, "mp3", Some(128)), None);
        assert_eq!(transcode_target(Some("raw"), 96, "flac", Some(900)), None);
        // Mobile data at 192 kbit/s.
        assert_eq!(
            transcode_target(None, 192, "flac", Some(900)),
            Some(("mp3", 192))
        );
        assert_eq!(
            transcode_target(None, 192, "mp3", Some(320)),
            Some(("mp3", 192))
        );
        // Another format asked.
        assert_eq!(
            transcode_target(Some("opus"), 0, "mp3", Some(320)),
            Some(("opus", 128))
        );
        assert_eq!(transcode_target(Some("mp3"), 0, "mp3", Some(320)), None);
    }

    #[test]
    fn lrc() {
        let l = parse_lrc("[ar:Someone]\n[00:12.50]Hello\n[01:02.00][00:01.00]Twice\nplain");
        assert_eq!(
            l,
            vec![
                (Some(1000), "Twice".into()),
                (Some(12500), "Hello".into()),
                (Some(62000), "Twice".into()),
                (None, "plain".into()),
            ]
        );
    }

    #[test]
    fn covers_are_resized_not_enlarged() {
        let img = image::RgbImage::from_pixel(600, 400, image::Rgb([200, 10, 10]));
        let mut png = Cursor::new(Vec::new());
        image::DynamicImage::ImageRgb8(img)
            .write_to(&mut png, image::ImageFormat::Png)
            .unwrap();
        let png = png.into_inner();
        let small = resize(&png, 300).unwrap();
        let out = image::load_from_memory(&small).unwrap();
        assert_eq!((out.width(), out.height()), (300, 200));
        assert_eq!(sniff(&small), "image/jpeg");
        assert_eq!(resize(&png, 1000).unwrap(), png, "never enlarged");
    }
}
