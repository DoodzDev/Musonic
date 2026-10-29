//! Media: `stream`, `download`, `getCoverArt`, `getLyrics`, `getLyricsBySongId`.
//!
//! Streams are the file itself (with HTTP ranges, so players can seek), or a transcoding by
//! ffmpeg when the client asks for a lower bit rate or another format. Without ffmpeg the file
//! is sent as is. A track without a file is streamed from the first audio provider that has it
//! (see [`crate::providers`]), through the shared segment cache, with ranges too. Covers come from the album (image file or embedded picture), else online
//! (albums and artists known only online), resized on request and cached on disk.

use std::{
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

use super::{ApiError, Code, Ctx, Reply, model, one, online, transcoded};
use crate::{online::OnlineId, server::AppState, stream::SEGMENT_SIZE};

/// Read size when sending audio: each read of a `tokio::fs::File` is a trip to a blocking
/// thread, so the 4 KiB default sends a song in about a thousand trips.
const CHUNK: usize = 256 * 1024;

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
pub(super) async fn send_file(
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
            let mut r = Response::new(Body::from_stream(ReaderStream::with_capacity(
                file.take(len),
                CHUNK,
            )));
            *r.status_mut() = StatusCode::PARTIAL_CONTENT;
            r.headers_mut().insert(
                header::CONTENT_RANGE,
                HeaderValue::from_str(&format!("bytes {start}-{end}/{size}")).expect("ascii"),
            );
            r.headers_mut().insert(header::CONTENT_LENGTH, len.into());
            r
        }
        None => {
            let mut r = Response::new(Body::from_stream(ReaderStream::with_capacity(file, CHUNK)));
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
/// `fallback`: the format used when only the bit rate is too high (server setting).
fn transcode_target(
    format: Option<&str>,
    fallback: &'static str,
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
    let target = wanted.unwrap_or(fallback);
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

/// One song prepared at a time, server-wide.
static PREPARING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// When the account's saved play queue (`savePlayQueue`) has `id` followed by another song,
/// transcodes that one in the background, so it starts at once from the cache when its turn
/// comes. Nothing when the queue is unknown, the next song needs no transcoding at this rate,
/// or another song is being prepared.
fn prepare_next(ctx: &Ctx, id: &str, target: &'static str, kbps: i64, budget: u64) {
    if PREPARING.swap(true, std::sync::atomic::Ordering::AcqRel) {
        return;
    }
    let (state, user, id) = (ctx.state.clone(), ctx.user.id.clone(), id.to_owned());
    let format = ctx.params.get("format").map(str::to_owned);
    let fallback = fallback_format(ctx);
    let max = ctx
        .params
        .get("maxBitRate")
        .and_then(|v| v.parse().ok())
        .unwrap_or(kbps);
    tokio::spawn(async move {
        let _done = scopeguard(|| PREPARING.store(false, std::sync::atomic::Ordering::Release));
        let next: Option<(String, String, String, Option<i64>)> = state
            .db
            .call(move |c| {
                Ok(c.query_row(
                    "SELECT l.path, f.path, f.format, f.bit_rate FROM play_queue_item q
                       JOIN play_queue_item n ON n.user_id = q.user_id AND n.position = q.position + 1
                       JOIN track_file f ON f.track_id = n.track_id AND f.missing = 0
                       JOIN library l ON l.id = f.library_id
                      WHERE q.user_id = ?1 AND q.track_id = ?2
                      ORDER BY q.position, coalesce(f.bit_rate, 0) DESC LIMIT 1",
                    [&user, &id],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
                )
                .optional()?)
            })
            .await
            .ok()
            .flatten();
        let Some((root, rel, file_format, bit_rate)) = next else {
            return;
        };
        let Some((t, k)) =
            transcode_target(format.as_deref(), fallback, max, &file_format, bit_rate)
        else {
            return;
        };
        if (t, k) != (target, kbps) {
            return;
        }
        let source = Path::new(&root).join(rel);
        let dest = transcoded::path(&state.data_dir, &source, t, k);
        if dest.is_file() {
            return;
        }
        let Some(dir) = dest.parent() else { return };
        let _ = std::fs::create_dir_all(dir);
        let tmp = dest.with_extension("preparing");
        let mut args = ffmpeg_args(&source, t, k, 0);
        args.pop();
        args.push(tmp.to_string_lossy().into_owned());
        let ok = tokio::process::Command::new(ffmpeg_bin())
            .args(["-y"])
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .status()
            .await
            .is_ok_and(|s| s.success());
        if ok && std::fs::rename(&tmp, &dest).is_ok() {
            let data_dir = state.data_dir.clone();
            let _ = tokio::task::spawn_blocking(move || transcoded::trim(&data_dir, budget)).await;
        } else {
            let _ = std::fs::remove_file(&tmp);
        }
    });
}

/// Runs `f` when dropped (also when the task ends early).
fn scopeguard(f: impl FnOnce()) -> impl Drop {
    struct Guard<F: FnOnce()>(Option<F>);
    impl<F: FnOnce()> Drop for Guard<F> {
        fn drop(&mut self) {
            if let Some(f) = self.0.take() {
                f();
            }
        }
    }
    Guard(Some(f))
}

/// Room for transcoded songs on disk, bytes (setting `transcode_cache_mb`; 0 = none).
fn transcode_budget(ctx: &Ctx) -> u64 {
    ctx.state
        .settings_now
        .get("transcode_cache_mb")
        .and_then(Value::as_u64)
        .unwrap_or(500)
        * 1024
        * 1024
}

/// The server's transcoding format (settings), MP3 when unset.
fn fallback_format(ctx: &Ctx) -> &'static str {
    match ctx
        .state
        .settings_now
        .get("transcode_format")
        .and_then(Value::as_str)
    {
        Some("opus") => "opus",
        Some("aac") => "aac",
        _ => "mp3",
    }
}

fn ffmpeg_bin() -> String {
    std::env::var("MUSONIC_FFMPEG").unwrap_or_else(|_| "ffmpeg".into())
}

pub async fn stream(ctx: &Ctx, download: bool) -> Result<Response, ApiError> {
    let id = ctx.params.require("id")?.to_owned();
    if id.starts_with(crate::ids::EPISODE_PREFIX) {
        return super::podcasts::stream(ctx, &id).await;
    }
    if download && !ctx.limits().await.can_download {
        return Err(ApiError::forbidden());
    }
    // Playing an online song is a use: it is stored first (see `crate::online`).
    let id = online::resolve_tracks(ctx, vec![id]).await?.remove(0);
    let file = match audio_file(ctx, &id).await {
        Ok(f) => f,
        Err(e) if e.code == Code::NotFound => return remote_stream(ctx, &id, download).await,
        Err(e) => return Err(e),
    };
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
    // The client's wish, within the user's limit.
    let max = ctx.max_bit_rate().await;
    let offset: i64 = ctx
        .params
        .get("timeOffset")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    if let Some((target, kbps)) = transcode_target(
        ctx.params.get("format"),
        fallback_format(ctx),
        max,
        &file.format,
        file.bit_rate,
    ) {
        let mime = match target {
            "opus" => "audio/ogg; codecs=opus",
            "aac" => "audio/aac",
            "ogg" => "audio/ogg",
            _ => "audio/mpeg",
        };
        let data_dir = ctx.state.data_dir.clone();
        let budget = transcode_budget(ctx);
        let kept = transcoded::path(&data_dir, &file.path, target, kbps);
        if budget > 0 {
            prepare_next(ctx, &id, target, kbps, budget);
        }
        // Already transcoded: a file, with ranges (seeking). A start offset needs ffmpeg.
        if budget > 0 && offset == 0 {
            let found = kept.clone();
            if let Ok(Some(size)) =
                tokio::task::spawn_blocking(move || transcoded::find(&found)).await
            {
                return Ok(send_file(ctx, &kept, mime, size, None).await);
            }
        }
        let spawned = tokio::process::Command::new(ffmpeg_bin())
            .args(ffmpeg_args(&file.path, target, kbps, offset))
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn();
        match spawned {
            Ok(child) => {
                // Kept when the whole song is made (not from an offset); the child is killed
                // when the client goes away (the stream, and it, are dropped).
                let keep = if offset == 0 { budget } else { 0 };
                let body =
                    Body::from_stream(transcoded::Tee::new(child, CHUNK, kept, data_dir, keep));
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

// Tracks without a file -------------------------------------------------------------------

/// Serves a provider's stream, with HTTP ranges like a file.
async fn remote_stream(ctx: &Ctx, id: &str, download: bool) -> Result<Response, ApiError> {
    // Without a file, the audio comes from online: not for users without the online catalog.
    if !ctx.limits().await.can_online {
        return Err(ApiError::not_found("Song"));
    }
    // The client's wish, within the user's limit.
    let max = ctx.max_bit_rate().await;
    let opened = crate::remote::open(
        &ctx.state.remote(),
        id,
        crate::remote::wanted_quality(max),
        false,
    )
    .await?;
    let Some((session, _)) = opened else {
        return Err(ApiError::not_found("Song"));
    };
    let size = session.size;
    let mime = session.format.mime();
    let range = ctx
        .headers
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok())
        .map(|v| parse_range(v, size));
    let (start, end, partial) = match range {
        Some(None) => {
            return Ok((
                StatusCode::RANGE_NOT_SATISFIABLE,
                [(header::CONTENT_RANGE, format!("bytes */{size}"))],
            )
                .into_response());
        }
        Some(Some((start, end))) => (start, end, true),
        None => (0, size - 1, false),
    };
    let body = futures_util::stream::unfold(start, move |pos| {
        let session = session.clone();
        async move {
            if pos > end {
                return None;
            }
            let len = (end + 1 - pos).min(SEGMENT_SIZE - pos % SEGMENT_SIZE);
            match session.read(pos, len).await {
                Ok(data) => Some((Ok(data), pos + len)),
                Err(e) => Some((Err(std::io::Error::other(e)), end + 1)),
            }
        }
    });
    let mut res = Response::new(Body::from_stream(body));
    if partial {
        *res.status_mut() = StatusCode::PARTIAL_CONTENT;
        res.headers_mut().insert(
            header::CONTENT_RANGE,
            HeaderValue::from_str(&format!("bytes {start}-{end}/{size}")).expect("ascii"),
        );
    }
    let h = res.headers_mut();
    h.insert(header::CONTENT_LENGTH, (end - start + 1).into());
    h.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    h.insert(header::CONTENT_TYPE, HeaderValue::from_static(mime));
    if download {
        h.insert(
            header::CONTENT_DISPOSITION,
            HeaderValue::from_static("attachment"),
        );
    }
    Ok(res)
}

// Covers ----------------------------------------------------------------------------------

/// Where a cover's picture is.
enum Cover {
    /// A file in the library (`file`: an image, `embedded`: inside an audio file), with a
    /// version stamp for the cache.
    Local {
        kind: String,
        path: PathBuf,
        stamp: i64,
    },
    /// An online picture (albums and artists known only online).
    Remote(String),
    /// A podcast's picture, on its host (ADR-023).
    Podcast(String),
}

/// Where a cover id's picture is: a playlist (`pl-…`), an album, a track (its album's cover,
/// else its own picture), an artist (`ar-…` or its id: their photo).
async fn cover_source(state: &AppState, id: &str) -> Result<Option<Cover>, ApiError> {
    let id = id.to_owned();
    let data_dir = state.data_dir.clone();
    Ok(state
        .db
        .call(move |c| {
            // A podcast show or episode: its picture on the host (an episode's own, else its show's).
            if id.starts_with(crate::ids::PODCAST_PREFIX) || id.starts_with(crate::ids::EPISODE_PREFIX) {
                let url: Option<String> = c
                    .query_row(
                        "SELECT image_url FROM podcast WHERE id = ?1
                         UNION ALL
                         SELECT coalesce(e.image_url, p.image_url) FROM episode e JOIN podcast p ON p.id = e.podcast_id
                          WHERE e.id = ?1",
                        [&id],
                        |r| r.get(0),
                    )
                    .optional()?
                    .flatten();
                return Ok(url.map(Cover::Podcast));
            }
            if let Some(pl) = id.strip_prefix("pl-") {
                let path: Option<String> = c
                    .query_row("SELECT cover_path FROM playlist WHERE id = ?1", [pl], |r| {
                        r.get(0)
                    })
                    .optional()?
                    .flatten();
                return Ok(path.map(|p| Cover::Local {
                    kind: "file".to_owned(),
                    path: data_dir.join(p),
                    stamp: 0,
                }));
            }
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
                // Nothing in the library: the online picture, if any.
                let artist = id.strip_prefix("ar-").unwrap_or(&id);
                let url: Option<String> = c.query_row(
                    "SELECT coalesce(
                        (SELECT cover_url FROM album WHERE id = ?1),
                        (SELECT coalesce(al.cover_url, t.cover_url) FROM track t
                           LEFT JOIN album al ON al.id = t.album_id WHERE t.id = ?1),
                        (SELECT image_url FROM artist WHERE id = ?2))",
                    [&id, artist],
                    |r| r.get(0),
                )?;
                return Ok(url.map(Cover::Remote));
            };
            let root: String =
                c.query_row("SELECT path FROM library ORDER BY id LIMIT 1", [], |r| {
                    r.get(0)
                })?;
            if let Some(rel) = cover_ref.strip_prefix("file:") {
                return Ok(Some(Cover::Local {
                    kind: "file".to_owned(),
                    path: Path::new(&root).join(rel),
                    stamp,
                }));
            }
            if let Some(file_id) = cover_ref.strip_prefix("embedded:") {
                let rel: Option<String> = c
                    .query_row(
                        "SELECT path FROM track_file WHERE id = ?1",
                        [file_id],
                        |r| r.get(0),
                    )
                    .optional()?;
                return Ok(rel.map(|rel| Cover::Local {
                    kind: "embedded".to_owned(),
                    path: Path::new(&root).join(rel),
                    stamp,
                }));
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

/// The picture fitted in `size` × `size` as RGB pixels, `None` when it is already smaller.
fn resized_pixels(
    data: &[u8],
    size: u32,
) -> anyhow::Result<Option<fast_image_resize::images::Image<'static>>> {
    use fast_image_resize::{
        FilterType, PixelType, ResizeAlg, ResizeOptions, Resizer, images::Image,
    };

    let img = image::load_from_memory(data)?;
    let (w, h) = (img.width(), img.height());
    if w <= size && h <= size {
        return Ok(None);
    }
    let scale = f64::from(size) / f64::from(w.max(h));
    let fit = |v: u32| ((f64::from(v) * scale).round() as u32).clamp(1, size);
    let src = Image::from_vec_u8(w, h, img.to_rgb8().into_raw(), PixelType::U8x3)?;
    let mut small = Image::new(fit(w), fit(h), PixelType::U8x3);
    Resizer::new().resize(
        &src,
        &mut small,
        &ResizeOptions::new().resize_alg(ResizeAlg::Convolution(FilterType::CatmullRom)),
    )?;
    Ok(Some(small))
}

/// The same resized picture with mozjpeg (trellis quantization, progressive): about a sixth
/// smaller at the same quality, but ten times slower, so made in the background.
fn smaller(data: &[u8], size: u32) -> Option<Vec<u8>> {
    let small = resized_pixels(data, size).ok()??;
    let mut c = mozjpeg::Compress::new(mozjpeg::ColorSpace::JCS_RGB);
    c.set_size(small.width() as usize, small.height() as usize);
    c.set_quality(f32::from(COVER_QUALITY));
    let mut c = c.start_compress(Vec::new()).ok()?;
    c.write_scanlines(small.buffer()).ok()?;
    c.finish().ok()
}

/// Whether a JPEG is progressive: the smaller versions are, the first ones are not.
fn is_progressive(jpeg: &[u8]) -> bool {
    let mut i = 2;
    while i + 4 <= jpeg.len() && jpeg[i] == 0xFF {
        match jpeg[i + 1] {
            0xC2 => return true,
            0xC0 | 0xC1 | 0xDA => return false,
            _ => i += 2 + usize::from(u16::from_be_bytes([jpeg[i + 2], jpeg[i + 3]])),
        }
    }
    false
}

/// Replaces a cached resized picture with its smaller version, one picture at a time; `load`
/// gives the original picture when its turn comes. A picture tried once (not made smaller)
/// is not tried again until the server restarts.
fn make_smaller(
    load: impl FnOnce() -> Option<Vec<u8>> + Send + 'static,
    size: u32,
    cached: PathBuf,
    current: usize,
) {
    use std::sync::atomic::{AtomicUsize, Ordering};
    static WAITING: AtomicUsize = AtomicUsize::new(0);
    static ONE: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(1);
    static TRIED: std::sync::Mutex<Option<std::collections::HashSet<PathBuf>>> =
        std::sync::Mutex::new(None);
    {
        let Ok(mut tried) = TRIED.lock() else { return };
        let tried = tried.get_or_insert_with(Default::default);
        if tried.len() > 100_000 {
            tried.clear();
        }
        if !tried.insert(cached.clone()) {
            return;
        }
    }
    if WAITING.fetch_add(1, Ordering::AcqRel) >= SMALLER_WAITING {
        WAITING.fetch_sub(1, Ordering::AcqRel);
        // Tried again when asked again.
        if let Ok(mut t) = TRIED.lock()
            && let Some(t) = t.as_mut()
        {
            t.remove(&cached);
        }
        return;
    }
    tokio::spawn(async move {
        let _turn = ONE.acquire().await;
        let _ = tokio::task::spawn_blocking(move || {
            if let Some(better) = load()
                .and_then(|original| smaller(&original, size))
                .filter(|b| b.len() < current)
            {
                let tmp = cached.with_extension("smaller");
                if std::fs::write(&tmp, &better).is_ok() {
                    let _ = std::fs::rename(&tmp, &cached);
                }
            }
        })
        .await;
        WAITING.fetch_sub(1, Ordering::AcqRel);
    });
}

/// JPEG quality of resized pictures.
const COVER_QUALITY: u8 = 80;
/// Pictures waiting for their smaller version at most; more are made smaller when asked
/// again. A picture just resized waits with its original in memory, a cached one with its
/// path only.
const SMALLER_WAITING: usize = 16;
/// Changes when resized pictures change, so the cached ones are made again.
const COVER_VERSION: &str = "3";

/// Fits the picture in `size` × `size` (never enlarges), as JPEG: SIMD resizing (about ten
/// times faster than `image`'s), then 4:2:0 chroma with optimized Huffman tables (a quarter
/// smaller than `image`'s 4:4:4 JPEG at the same quality).
fn resize(data: &[u8], size: u32) -> anyhow::Result<Vec<u8>> {
    let Some(small) = resized_pixels(data, size)? else {
        return Ok(data.to_vec());
    };
    let mut out = Vec::new();
    let mut jpeg = jpeg_encoder::Encoder::new(&mut out, COVER_QUALITY);
    jpeg.set_sampling_factor(jpeg_encoder::SamplingFactor::F_2_2);
    jpeg.set_optimized_huffman_tables(true);
    jpeg.encode(
        small.buffer(),
        small.width() as u16,
        small.height() as u16,
        jpeg_encoder::ColorType::Rgb,
    )?;
    Ok(out)
}

pub async fn cover_art(ctx: &Ctx) -> Result<Response, ApiError> {
    let id = ctx.params.require("id")?.to_owned();
    let size: Option<u32> = ctx
        .params
        .get("size")
        .and_then(|v| v.parse().ok())
        .filter(|s| *s > 0 && *s < 4096);
    let source = match OnlineId::parse(&id) {
        Some(item) => online::cover_url(ctx, item).await?.map(Cover::Remote),
        None => cover_source(&ctx.state, &id).await?,
    };
    cover_response(&ctx.state, &id, source, size).await
}

/// A library picture (album, track, artist, playlist id) for the console: the same pictures
/// and cache as `getCoverArt`.
pub async fn library_cover(
    state: &AppState,
    id: &str,
    size: Option<u32>,
) -> Result<Response, ApiError> {
    let source = cover_source(state, id).await?;
    cover_response(state, id, source, size).await
}

async fn cover_response(
    state: &AppState,
    id: &str,
    source: Option<Cover>,
    size: Option<u32>,
) -> Result<Response, ApiError> {
    let Some(source) = source else {
        return Ok(StatusCode::NOT_FOUND.into_response());
    };
    let key = hex::encode(Sha256::digest(match &source {
        Cover::Local { kind, path, stamp } => {
            format!(
                "{kind}\u{1f}{}\u{1f}{stamp}\u{1f}{size:?}\u{1f}{COVER_VERSION}",
                path.display()
            )
        }
        Cover::Remote(url) | Cover::Podcast(url) => {
            format!("url\u{1f}{url}\u{1f}{size:?}\u{1f}{COVER_VERSION}")
        }
    }));
    let cached = state
        .data_dir
        .join("cache")
        .join("covers")
        .join(&key[..2])
        .join(&key);
    // Where the original is, to make a cached picture smaller later.
    let local = match &source {
        Cover::Local { kind, path, .. } => Some((kind.clone(), path.clone())),
        Cover::Remote(_) | Cover::Podcast(_) => None,
    };
    // None: already cached.
    let original = match source {
        _ if cached.is_file() => None,
        Cover::Local { kind, path, .. } => Some(
            tokio::task::spawn_blocking(move || read_picture(&kind, &path))
                .await
                .map_err(anyhow::Error::from)?,
        ),
        Cover::Remote(url) => Some(match state.online.as_deref() {
            Some(dz) => dz.picture(&url).await,
            None => Err(anyhow::anyhow!("online catalog disabled")),
        }),
        Cover::Podcast(url) => Some(state.podcasts.picture(&url).await),
    };
    let bytes = tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<u8>> {
        let Some(original) = original else {
            let data = std::fs::read(&cached)?;
            if let (Some(s), Some((kind, path))) = (size, local)
                && sniff(&data) == "image/jpeg"
                && !is_progressive(&data)
            {
                let current = data.len();
                make_smaller(move || read_picture(&kind, &path).ok(), s, cached, current);
            }
            return Ok(data);
        };
        let original = original?;
        let (data, resized) = match size {
            Some(s) => match resize(&original, s) {
                Ok(small) if small != original => (small, true),
                _ => (original.clone(), false),
            },
            None => (original.clone(), false),
        };
        if let Some(dir) = cached.parent() {
            let _ = std::fs::create_dir_all(dir);
            let tmp = cached.with_extension("tmp");
            if std::fs::write(&tmp, &data).is_ok() && std::fs::rename(&tmp, &cached).is_ok() {
                // The blocking pool runs inside the runtime: the task can be spawned from here.
                if let (true, Some(s)) = (resized, size) {
                    make_smaller(move || Some(original), s, cached, data.len());
                }
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
    // A podcast episode: its transcript, when the show publishes one (ADR-023).
    if id.starts_with(crate::ids::EPISODE_PREFIX) {
        let lines = ctx.state.podcasts.transcript(&id).await.unwrap_or_default();
        let list: Vec<Value> = if lines.is_empty() {
            Vec::new()
        } else {
            vec![json!({
                "lang": "xxx",
                "synced": true,
                "line": lines.into_iter().map(|(start, value)| json!({ "start": start, "value": value })).collect::<Vec<_>>(),
            })]
        };
        return Ok(one("lyricsList", json!({ "structuredLyrics": list })));
    }
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
        assert_eq!(transcode_target(None, "mp3", 0, "mp3", Some(320)), None);
        assert_eq!(transcode_target(None, "mp3", 192, "mp3", Some(128)), None);
        assert_eq!(
            transcode_target(Some("raw"), "mp3", 96, "flac", Some(900)),
            None
        );
        // Mobile data at 192 kbit/s.
        assert_eq!(
            transcode_target(None, "mp3", 192, "flac", Some(900)),
            Some(("mp3", 192))
        );
        assert_eq!(
            transcode_target(None, "mp3", 192, "mp3", Some(320)),
            Some(("mp3", 192))
        );
        // Another format asked.
        assert_eq!(
            transcode_target(Some("opus"), "mp3", 0, "mp3", Some(320)),
            Some(("opus", 128))
        );
        assert_eq!(
            transcode_target(Some("mp3"), "mp3", 0, "mp3", Some(320)),
            None
        );
        // The server's format when only the bit rate is too high.
        assert_eq!(
            transcode_target(None, "opus", 128, "flac", Some(900)),
            Some(("opus", 128))
        );
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
    fn the_smaller_version_is_the_same_picture() {
        // A photo-like picture: a gradient with noise.
        let img = image::RgbImage::from_fn(900, 900, |x, y| {
            let n = ((x * 7919 + y * 104729) % 37) as u8;
            image::Rgb([(x / 4) as u8 ^ n, (y / 4) as u8, ((x + y) / 8) as u8 ^ n])
        });
        let mut png = std::io::Cursor::new(Vec::new());
        image::DynamicImage::ImageRgb8(img)
            .write_to(&mut png, image::ImageFormat::Png)
            .unwrap();
        let png = png.into_inner();
        let fast = resize(&png, 300).unwrap();
        let small = smaller(&png, 300).unwrap();
        let out = image::load_from_memory(&small).unwrap();
        assert_eq!((out.width(), out.height()), (300, 300));
        assert_eq!(sniff(&small), "image/jpeg");
        assert!(small.len() < fast.len(), "{} < {}", small.len(), fast.len());
        assert!(smaller(&png, 1000).is_none(), "never enlarged");
        assert!(is_progressive(&small));
        assert!(!is_progressive(&fast));
    }

    #[test]
    fn covers_are_resized_not_enlarged() {
        let img = image::RgbImage::from_pixel(600, 400, image::Rgb([200, 10, 10]));
        let mut png = std::io::Cursor::new(Vec::new());
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
