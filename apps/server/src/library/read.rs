//! Reading an audio file: tags (with several values per field when the file has them) and audio
//! properties, turned into a [`FileInfo`] the scanner can store.

use std::path::Path;

use anyhow::{Context, Result};
use lofty::{
    config::ParseOptions,
    file::{AudioFile, TaggedFile, TaggedFileExt},
    probe::Probe,
    tag::{Accessor, ItemKey, Tag},
};

/// Extensions of the audio files the scanner picks up.
pub const AUDIO_EXTENSIONS: &[&str] = &[
    "mp3", "flac", "m4a", "mp4", "aac", "alac", "ogg", "oga", "opus", "wav", "aif", "aiff", "wv",
    "ape", "mpc", "wma",
];

/// Separators splitting one tag value into several artists ("A feat. B", "A; B"…).
const ARTIST_SEPARATORS: &[&str] = &[" feat. ", " feat ", " ft. ", " ft ", " • ", "; ", " / "];
/// Separators of several genres in one value. Not '/': catalog genres such as "Rap/Hip Hop"
/// are a single genre.
const GENRE_SEPARATORS: &[char] = &[';'];
/// Separators of several people in one composer value (ID3v2.3 uses '/').
const ROLE_SEPARATORS: &[char] = &['/', ';'];

pub fn is_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| AUDIO_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
}

/// Everything the scanner keeps from one audio file.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct FileInfo {
    pub title: String,
    pub sort_title: Option<String>,
    pub artists: Vec<String>,
    pub album: Option<String>,
    pub sort_album: Option<String>,
    pub album_artists: Vec<String>,
    pub composers: Vec<String>,
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    pub year: Option<u32>,
    /// `YYYY`, `YYYY-MM` or `YYYY-MM-DD`.
    pub release_date: Option<String>,
    pub genres: Vec<String>,
    pub compilation: bool,
    pub isrc: Option<String>,
    pub mbid_track: Option<String>,
    pub mbid_album: Option<String>,
    pub bpm: Option<u32>,
    pub lyrics: Option<String>,
    pub has_cover: bool,
    pub duration_ms: i64,
    pub bit_rate: Option<u32>,
    pub sample_rate: Option<u32>,
    pub bit_depth: Option<u8>,
    pub channels: Option<u8>,
}

/// Reads a file. A file without tags gets its title from the file name.
pub fn read_file(path: &Path) -> Result<FileInfo> {
    let probe = |options: ParseOptions, guess: bool| -> Result<TaggedFile> {
        let probe = Probe::open(path)
            .with_context(|| format!("opening {}", path.display()))?
            .options(options);
        let probe = if guess {
            probe.guess_file_type()?
        } else {
            probe
        };
        Ok(probe.read()?)
    };
    // A damaged or misnamed file (AAC data in a .mp3…) may fail on its audio properties or
    // its detected type: its tags are still worth reading, as the extension says.
    let tags_only = || ParseOptions::new().read_properties(false);
    let tagged = probe(ParseOptions::new(), true)
        .or_else(|_| probe(tags_only(), true))
        .or_else(|_| probe(tags_only(), false))
        .with_context(|| format!("reading {}", path.display()))?;
    let props = tagged.properties();
    let mut info = tagged
        .primary_tag()
        .or_else(|| tagged.first_tag())
        .map(from_tag)
        .unwrap_or_default();
    if info.title.is_empty() {
        info.title = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown")
            .to_owned();
    }
    info.duration_ms = props.duration().as_millis() as i64;
    info.bit_rate = props.audio_bitrate();
    info.sample_rate = props.sample_rate();
    info.bit_depth = props.bit_depth();
    info.channels = props.channels();
    Ok(info)
}

fn text(tag: &Tag, key: &ItemKey) -> Option<String> {
    tag.get_string(key)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
}

/// Every value of a field, each split on `split`, trimmed, deduplicated in order.
fn values(tag: &Tag, key: &ItemKey, split: impl Fn(&str) -> Vec<String>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for v in tag.get_strings(key) {
        for part in split(v) {
            if !part.is_empty() && !out.iter().any(|o| o.eq_ignore_ascii_case(&part)) {
                out.push(part);
            }
        }
    }
    out
}

pub fn split_artists(value: &str) -> Vec<String> {
    let mut parts = vec![value.to_owned()];
    for sep in ARTIST_SEPARATORS {
        parts = parts
            .iter()
            .flat_map(|p| {
                // Case-insensitive split ("Feat.", "FT"); ASCII lowercase keeps byte offsets.
                let lower = p.to_ascii_lowercase();
                let mut pieces = Vec::new();
                let mut start = 0;
                while let Some(i) = lower[start..].find(sep) {
                    pieces.push(p[start..start + i].to_owned());
                    start += i + sep.len();
                }
                pieces.push(p[start..].to_owned());
                pieces
            })
            .collect();
    }
    parts.into_iter().map(|p| p.trim().to_owned()).collect()
}

fn split_roles(value: &str) -> Vec<String> {
    value
        .split(ROLE_SEPARATORS)
        .map(|v| v.trim().to_owned())
        .collect()
}

fn split_genres(value: &str) -> Vec<String> {
    value
        .split(GENRE_SEPARATORS)
        .map(|g| g.trim().to_owned())
        .collect()
}

fn number(value: &str) -> Option<u32> {
    value
        .split('/')
        .next()?
        .trim()
        .parse()
        .ok()
        .filter(|n| *n > 0)
}

/// First date-looking value: `2005`, `2005-09`, `2005-09-12` (a time part is dropped).
fn date(tag: &Tag) -> Option<String> {
    [
        ItemKey::ReleaseDate,
        ItemKey::RecordingDate,
        ItemKey::Year,
        ItemKey::OriginalReleaseDate,
    ]
    .iter()
    .filter_map(|k| text(tag, k))
    .map(|d| d.chars().take(10).collect::<String>())
    .find(|d| d.len() >= 4 && d[..4].chars().all(|c| c.is_ascii_digit()))
}

fn from_tag(tag: &Tag) -> FileInfo {
    let release_date = date(tag);
    let year = release_date
        .as_deref()
        .and_then(|d| d[..4].parse().ok())
        .or_else(|| tag.year());
    let mut artists = values(tag, &ItemKey::TrackArtists, split_artists);
    if artists.is_empty() {
        artists = values(tag, &ItemKey::TrackArtist, split_artists);
    }
    FileInfo {
        title: tag.title().map(|t| t.trim().to_owned()).unwrap_or_default(),
        sort_title: text(tag, &ItemKey::TrackTitleSortOrder),
        artists,
        album: tag
            .album()
            .map(|a| a.trim().to_owned())
            .filter(|a| !a.is_empty()),
        sort_album: text(tag, &ItemKey::AlbumTitleSortOrder),
        album_artists: values(tag, &ItemKey::AlbumArtist, split_artists),
        composers: values(tag, &ItemKey::Composer, split_roles),
        track_number: tag.track().filter(|n| *n > 0),
        disc_number: tag.disk().filter(|n| *n > 0),
        year,
        release_date,
        genres: values(tag, &ItemKey::Genre, split_genres),
        compilation: text(tag, &ItemKey::FlagCompilation).is_some_and(|v| v == "1"),
        isrc: text(tag, &ItemKey::Isrc).map(|i| i.to_uppercase()),
        mbid_track: text(tag, &ItemKey::MusicBrainzRecordingId),
        mbid_album: text(tag, &ItemKey::MusicBrainzReleaseId),
        bpm: text(tag, &ItemKey::IntegerBpm)
            .or_else(|| text(tag, &ItemKey::Bpm))
            .and_then(|b| number(b.split('.').next().unwrap_or_default())),
        lyrics: text(tag, &ItemKey::Lyrics),
        has_cover: !tag.pictures().is_empty(),
        ..Default::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_artists() {
        assert_eq!(
            split_artists("Daft Punk feat. Pharrell Williams"),
            ["Daft Punk", "Pharrell Williams"]
        );
        assert_eq!(split_artists("113 • Rim'K"), ["113", "Rim'K"]);
        assert_eq!(split_artists("A; B / C FT. D"), ["A", "B", "C", "D"]);
        assert_eq!(
            split_artists("AC/DC"),
            ["AC/DC"],
            "no spaces around the slash: one name"
        );
    }

    #[test]
    fn numbers_and_genres() {
        assert_eq!(number("3/12"), Some(3));
        assert_eq!(number("0"), None);
        assert_eq!(split_genres("Rock; Rap/Hip Hop"), ["Rock", "Rap/Hip Hop"]);
        assert_eq!(
            split_roles("Kanye West/Mos Def/Al Be Back"),
            ["Kanye West", "Mos Def", "Al Be Back"]
        );
    }

    #[test]
    fn audio_extensions() {
        assert!(is_audio(Path::new("a/B.MP3")));
        assert!(is_audio(Path::new("x.flac")));
        assert!(!is_audio(Path::new("cover.jpg")));
        assert!(!is_audio(Path::new("noext")));
    }
}
