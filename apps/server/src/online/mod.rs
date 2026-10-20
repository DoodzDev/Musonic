//! Online catalog: search, albums and artists from Deezer's public API, and "virtual" tracks.
//!
//! Online items reach clients with ids such as `dz-track-3135556`. Browsing them writes
//! nothing; the first time a client uses a track (like, playlist, play, queue) it is stored
//! as a library track without a file, under a canonical id like any other. Its file, once
//! imported, lands on that same track: likes and playlists stay where they are.

pub mod deezer;
pub mod render;
pub mod store;

pub use deezer::Deezer;

/// Provider name in `track_source`, `album_source`, `artist_source`.
pub const DEEZER: &str = "deezer";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OnlineId {
    Track(u64),
    Album(u64),
    Artist(u64),
}

impl OnlineId {
    pub fn parse(id: &str) -> Option<Self> {
        let rest = id.strip_prefix("dz-")?;
        let (kind, num) = rest.split_once('-')?;
        let num = num.parse().ok()?;
        match kind {
            "track" => Some(Self::Track(num)),
            "album" => Some(Self::Album(num)),
            "artist" => Some(Self::Artist(num)),
            _ => None,
        }
    }
}

pub fn track_id(id: u64) -> String {
    format!("dz-track-{id}")
}

pub fn album_id(id: u64) -> String {
    format!("dz-album-{id}")
}

pub fn artist_id(id: u64) -> String {
    format!("dz-artist-{id}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_round_trip() {
        assert_eq!(OnlineId::parse(&track_id(42)), Some(OnlineId::Track(42)));
        assert_eq!(OnlineId::parse(&album_id(7)), Some(OnlineId::Album(7)));
        assert_eq!(OnlineId::parse(&artist_id(1)), Some(OnlineId::Artist(1)));
        assert_eq!(OnlineId::parse("dz-track-x"), None);
        assert_eq!(OnlineId::parse("ext-deezer-song-1"), None);
        assert_eq!(OnlineId::parse("6d75-736f"), None);
    }
}
