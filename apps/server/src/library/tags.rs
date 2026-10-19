//! Turning a fully downloaded stream into a tagged file in the music library.

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use lofty::{
    config::WriteOptions,
    file::TaggedFileExt,
    picture::{MimeType, Picture, PictureType},
    probe::Probe,
    tag::{Accessor, ItemKey, Tag, TagExt},
};

use crate::model::{AudioFormat, Track};

/// File/dir name safe on every filesystem.
pub fn sanitize(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if c.is_control() || r#"/\:*?"<>|"#.contains(c) {
                ' '
            } else {
                c
            }
        })
        .collect();
    let cleaned = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    let cleaned = cleaned.trim_matches(|c| c == '.' || c == ' ');
    let mut out: String = cleaned.chars().take(120).collect();
    if out.is_empty() {
        out = "Unknown".into();
    }
    out
}

/// `Album Artist/Album/NN - Title.ext`
pub fn relative_path(track: &Track, format: AudioFormat) -> PathBuf {
    let album_artist = track
        .album
        .as_ref()
        .and_then(|a| a.artists.first().cloned())
        .or_else(|| track.artists.first().map(|a| a.name.clone()))
        .unwrap_or_else(|| "Unknown Artist".into());
    let album = track
        .album
        .as_ref()
        .map(|a| a.title.clone())
        .unwrap_or_else(|| "Unknown Album".into());
    let number = match (track.disc_number, track.track_number) {
        (Some(d), Some(n)) if d > 1 => format!("{d}-{n:02} - "),
        (_, Some(n)) => format!("{n:02} - "),
        _ => String::new(),
    };
    PathBuf::from(sanitize(&album_artist))
        .join(sanitize(&album))
        .join(format!(
            "{number}{}.{}",
            sanitize(&track.title),
            format.extension()
        ))
}

fn mime(data: &[u8]) -> MimeType {
    match data {
        [0x89, b'P', b'N', b'G', ..] => MimeType::Png,
        _ => MimeType::Jpeg,
    }
}

/// Replaces all tags of `path` with the metadata of `track` (+ embedded front cover).
pub fn tag_file(path: &Path, track: &Track, cover: Option<Vec<u8>>) -> Result<()> {
    let tagged = Probe::open(path)?
        .guess_file_type()?
        .read()
        .context("reading audio file")?;
    let tag_type = tagged.primary_tag_type();
    drop(tagged);
    // Remove whatever tag the source file had.
    let _ = tag_type.remove_from_path(path);

    let mut tag = Tag::new(tag_type);
    tag.set_title(track.title.clone());
    let names: Vec<&str> = track.artists.iter().map(|a| a.name.as_str()).collect();
    if !names.is_empty() {
        tag.set_artist(names.join("; "));
    }
    if let Some(album) = &track.album {
        tag.set_album(album.title.clone());
        if let Some(aa) = album.artists.first() {
            tag.insert_text(ItemKey::AlbumArtist, aa.clone());
        }
    }
    if let Some(n) = track.track_number.and_then(|n| u32::try_from(n).ok()) {
        tag.set_track(n);
    }
    if let Some(d) = track.disc_number.and_then(|d| u32::try_from(d).ok()) {
        tag.set_disk(d);
    }
    if let Some(date) = &track.release_date {
        tag.insert_text(ItemKey::RecordingDate, date.clone());
    }
    if let Some(isrc) = &track.isrc {
        tag.insert_text(ItemKey::Isrc, isrc.clone());
    }
    if let Some(data) = cover.filter(|d| !d.is_empty()) {
        let m = mime(&data);
        tag.push_picture(Picture::new_unchecked(
            PictureType::CoverFront,
            Some(m),
            None,
            data,
        ));
    }
    tag.save_to_path(path, WriteOptions::default())
        .context("writing tags")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{TrackAlbum, TrackArtist};

    #[test]
    fn paths_are_safe() {
        assert_eq!(sanitize("AC/DC: Live?"), "AC DC Live");
        assert_eq!(sanitize("..."), "Unknown");
        let t = Track {
            id: "x".into(),
            title: "Harder/Better".into(),
            isrc: None,
            duration: 1,
            cover_url: None,
            disc_number: Some(1),
            track_number: Some(4),
            is_explicit: false,
            popularity: None,
            album: Some(TrackAlbum {
                id: "a".into(),
                title: "Discovery".into(),
                cover_url: None,
                artists: vec!["Daft Punk".into()],
            }),
            artists: vec![TrackArtist {
                id: "b".into(),
                name: "Daft Punk".into(),
            }],
            release_date: None,
            sources: Default::default(),
            in_library: false,
        };
        assert_eq!(
            relative_path(&t, AudioFormat::Flac),
            PathBuf::from("Daft Punk/Discovery/04 - Harder Better.flac")
        );
    }
}
