//! Test helpers: small WAV files with tags, written in temporary folders.

use std::path::Path;

use lofty::{
    config::WriteOptions,
    picture::{MimeType, Picture, PictureType},
    tag::{Accessor, ItemKey, Tag, TagExt, TagType},
};

pub struct Song<'a> {
    pub title: &'a str,
    pub artist: &'a str,
    pub album: &'a str,
    pub track: u32,
    pub isrc: Option<&'a str>,
    pub genre: &'a str,
    pub cover: bool,
}

pub const SONG: Song = Song {
    title: "Hoppípolla",
    artist: "Sigur Rós",
    album: "Takk...",
    track: 3,
    isrc: None,
    genre: "Post-Rock",
    cover: false,
};

/// A valid one-second mono WAV file.
pub fn wav() -> Vec<u8> {
    let rate: u32 = 8000;
    let data = vec![0u8; rate as usize * 2];
    let mut f = Vec::new();
    f.extend_from_slice(b"RIFF");
    f.extend_from_slice(&(36 + data.len() as u32).to_le_bytes());
    f.extend_from_slice(b"WAVEfmt ");
    f.extend_from_slice(&16u32.to_le_bytes());
    f.extend_from_slice(&1u16.to_le_bytes()); // PCM
    f.extend_from_slice(&1u16.to_le_bytes()); // mono
    f.extend_from_slice(&rate.to_le_bytes());
    f.extend_from_slice(&(rate * 2).to_le_bytes());
    f.extend_from_slice(&2u16.to_le_bytes());
    f.extend_from_slice(&16u16.to_le_bytes());
    f.extend_from_slice(b"data");
    f.extend_from_slice(&(data.len() as u32).to_le_bytes());
    f.extend_from_slice(&data);
    f
}

pub fn write_song(root: &Path, rel: &str, s: &Song) {
    let path = root.join(rel);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, wav()).unwrap();
    let mut tag = Tag::new(TagType::Id3v2);
    tag.set_title(s.title.into());
    tag.set_artist(s.artist.into());
    tag.set_album(s.album.into());
    tag.set_track(s.track);
    tag.set_genre(s.genre.into());
    tag.insert_text(ItemKey::RecordingDate, "2005-09-12".into());
    if let Some(isrc) = s.isrc {
        tag.insert_text(ItemKey::Isrc, isrc.into());
    }
    if s.cover {
        tag.push_picture(Picture::new_unchecked(
            PictureType::CoverFront,
            Some(MimeType::Png),
            None,
            png(),
        ));
    }
    tag.save_to_path(&path, WriteOptions::default()).unwrap();
}

/// A real 64 × 48 PNG.
pub fn png() -> Vec<u8> {
    let img = image::RgbImage::from_pixel(64, 48, image::Rgb([30, 120, 200]));
    let mut out = std::io::Cursor::new(Vec::new());
    image::DynamicImage::ImageRgb8(img)
        .write_to(&mut out, image::ImageFormat::Png)
        .unwrap();
    out.into_inner()
}

/// A fresh empty folder in the temp dir.
pub fn temp_dir(name: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("musonic-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}
