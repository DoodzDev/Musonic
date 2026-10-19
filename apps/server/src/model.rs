//! Music model shared by the library, the metadata sources and the native API.
//!
//! Ids: albums, artists and playlists keep a provider-qualified id (`deezer:302127`);
//! tracks get a canonical id (UUID) once they go through the catalog, plus `sources`
//! listing every known provider id.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Quality {
    Mp3_128,
    Mp3_320,
    Flac,
}

impl Quality {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "mp3_128" => Some(Self::Mp3_128),
            "mp3_320" => Some(Self::Mp3_320),
            "flac" => Some(Self::Flac),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AudioFormat {
    Mp3,
    Flac,
}

impl AudioFormat {
    pub fn mime(self) -> &'static str {
        match self {
            Self::Mp3 => "audio/mpeg",
            Self::Flac => "audio/flac",
        }
    }

    pub fn extension(self) -> &'static str {
        match self {
            Self::Mp3 => "mp3",
            Self::Flac => "flac",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ItemKind {
    Track,
    Album,
    Artist,
    Playlist,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Discography {
    Albums,
    Singles,
    Compilations,
    AppearsOn,
}

#[derive(Debug, Clone, Serialize)]
pub struct SocialNetwork {
    pub name: String,
    pub link: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Artist {
    pub id: String,
    pub name: String,
    pub picture_url: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub social_networks: Vec<SocialNetwork>,
    pub fans_count: Option<i64>,
    pub bio: Option<String>,
}

impl Artist {
    pub fn named(id: String, name: String) -> Self {
        Self {
            id,
            name,
            picture_url: None,
            social_networks: Vec::new(),
            fans_count: None,
            bio: None,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AlbumType {
    Album,
    Ep,
    Single,
    Unknown,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AlbumSubtype {
    Studio,
    Live,
    Compilation,
    Karaoke,
}

#[derive(Debug, Clone, Serialize)]
pub struct Album {
    pub id: String,
    pub title: String,
    pub cover_url: Option<String>,
    pub artists: Vec<Artist>,
    pub release_date: Option<String>,
    pub album_type: AlbumType,
    pub subtypes: Vec<AlbumSubtype>,
    pub tracks_count: Option<i64>,
    pub is_explicit: bool,
    pub fans_count: Option<i64>,
    pub label: Option<String>,
    pub copyright: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackAlbum {
    pub id: String,
    pub title: String,
    pub cover_url: Option<String>,
    pub artists: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackArtist {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Track {
    pub id: String,
    pub title: String,
    pub isrc: Option<String>,
    /// Seconds.
    pub duration: i64,
    pub cover_url: Option<String>,
    pub disc_number: Option<i64>,
    pub track_number: Option<i64>,
    pub is_explicit: bool,
    pub popularity: Option<f64>,
    pub album: Option<TrackAlbum>,
    pub artists: Vec<TrackArtist>,
    pub release_date: Option<String>,
    /// Provider ids of this track (`{"deezer": "3135556"}`), filled by the catalog.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub sources: BTreeMap<String, String>,
    /// True when a file of this track is in the library.
    #[serde(default)]
    pub in_library: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct Profile {
    pub name: String,
    pub link: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Playlist {
    pub id: String,
    pub title: String,
    pub owner: Option<Profile>,
    pub description: Option<String>,
    pub cover_url: Option<String>,
    pub is_public: bool,
    pub fans_count: Option<i64>,
    pub tracks_count: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Page<T> {
    pub items: Vec<T>,
    pub next_cursor: Option<String>,
    pub has_more: bool,
}

impl<T> Default for Page<T> {
    fn default() -> Self {
        Self {
            items: Vec::new(),
            next_cursor: None,
            has_more: false,
        }
    }
}

impl<T> Page<T> {
    pub fn map<U>(self, f: impl FnMut(T) -> U) -> Page<U> {
        Page {
            items: self.items.into_iter().map(f).collect(),
            next_cursor: self.next_cursor,
            has_more: self.has_more,
        }
    }

    /// Offset pagination over a full list (for sources without server-side paging).
    pub fn slice(all: Vec<T>, limit: usize, cursor: Option<&str>) -> Self {
        let offset = cursor.and_then(|c| c.parse::<usize>().ok()).unwrap_or(0);
        let total = all.len();
        let items: Vec<T> = all.into_iter().skip(offset).take(limit).collect();
        let end = offset + items.len();
        Page {
            items,
            next_cursor: (end < total).then(|| end.to_string()),
            has_more: end < total,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", content = "data", rename_all = "snake_case")]
pub enum Item {
    Track(Track),
    Album(Album),
    Artist(Artist),
    Playlist(Playlist),
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct Preview {
    pub best: Option<Item>,
    pub tracks: Vec<Track>,
    pub artists: Vec<Artist>,
    pub albums: Vec<Album>,
}

/// `provider:id` helpers.
pub fn qualify(provider: &str, id: impl std::fmt::Display) -> String {
    format!("{provider}:{id}")
}

pub fn split_qualified(id: &str) -> Option<(&str, &str)> {
    id.split_once(':')
        .filter(|(p, i)| !p.is_empty() && !i.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slice_pages() {
        let p = Page::slice((0..5).collect::<Vec<_>>(), 2, None);
        assert_eq!(p.items, vec![0, 1]);
        assert_eq!(p.next_cursor.as_deref(), Some("2"));
        let p = Page::slice((0..5).collect::<Vec<_>>(), 2, Some("4"));
        assert_eq!(p.items, vec![4]);
        assert!(!p.has_more);
    }

    #[test]
    fn qualified_ids() {
        assert_eq!(split_qualified("deezer:a-b-c"), Some(("deezer", "a-b-c")));
        assert_eq!(split_qualified("nope"), None);
        assert_eq!(qualify("deezer", 12), "deezer:12");
    }

    #[test]
    fn quality_order() {
        assert!(Quality::Flac > Quality::Mp3_320 && Quality::Mp3_320 > Quality::Mp3_128);
    }
}
