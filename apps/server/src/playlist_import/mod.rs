//! Playlists imported from other services (ADR-020): an address (or a list of song links) is
//! read by a [`PlaylistSource`], each song is looked for in the library then in the online
//! catalog ([`matching`]), and the playlist is made in the account ([`service`]).
//!
//! Deezer is read here, from its public API. Other sources are plugged in by a binary
//! through [`crate::Extensions`].

pub mod deezer;
pub mod matching;
pub mod service;
#[cfg(test)]
mod tests;

use async_trait::async_trait;

pub use deezer::DeezerPlaylists;
pub use service::PlaylistImports;

/// Songs read at most from one playlist.
pub const MAX_TRACKS: usize = 2000;

/// A song as the other service shows it.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct SourceTrack {
    pub title: String,
    /// Main artist first.
    pub artists: Vec<String>,
    pub album: Option<String>,
    pub duration_ms: Option<i64>,
    pub isrc: Option<String>,
    /// The song's address at the source.
    pub link: Option<String>,
    /// Its id there (for Deezer: the id of the online catalog).
    pub id: Option<String>,
}

/// A playlist as read from the other service.
#[derive(Debug, Clone, Default)]
pub struct SourcePlaylist {
    /// The source's id: `deezer`, `spotify`.
    pub source: String,
    /// The playlist's id there (`None` for a list of links).
    pub id: Option<String>,
    pub name: String,
    pub owner: Option<String>,
    pub cover_url: Option<String>,
    /// Songs the playlist has, when known (may be more than [`Self::tracks`]).
    pub total: Option<u32>,
    pub tracks: Vec<SourceTrack>,
    /// Opens the playlist in the service's own app (`spotify:playlist:…`).
    pub app_link: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum SourceError {
    /// The address is not one of this source's playlists.
    #[error("not a playlist address of this service")]
    NotMine,
    /// No such playlist, or a private one.
    #[error("playlist not found or private")]
    NotFound,
    #[error("the service does not answer: {0:#}")]
    Unavailable(#[from] anyhow::Error),
}

/// A service playlists can be imported from.
#[async_trait]
pub trait PlaylistSource: Send + Sync {
    /// `deezer`, `spotify`.
    fn id(&self) -> &'static str;

    /// Whether `url` looks like this service (even when it is not a playlist): a link from a
    /// service that is not available is told so.
    fn knows(&self, url: &str) -> bool;

    /// The playlist at `url`.
    async fn playlist(&self, url: &str) -> Result<SourcePlaylist, SourceError>;

    /// The song links of this service in a pasted text (the links copied from its app), in
    /// order. Empty when the source does not read lists of links.
    fn links(&self, _text: &str) -> Vec<String> {
        Vec::new()
    }

    /// The songs behind `links` (as returned by [`Self::links`]), in the same order.
    async fn tracks(&self, _links: &[String]) -> Result<Vec<SourceTrack>, SourceError> {
        Ok(Vec::new())
    }
}

/// The host of an address, lower case, without `www.`.
pub fn host(url: &str) -> Option<String> {
    let rest = url.trim().split_once("://").map_or(url.trim(), |(_, r)| r);
    let host = rest.split(['/', '?', '#']).next()?.to_ascii_lowercase();
    let host = host.rsplit('@').next()?.split(':').next()?.to_owned();
    (!host.is_empty()).then(|| host.trim_start_matches("www.").to_owned())
}

/// Path segments of an address (without its query), e.g. `["fr", "playlist", "123"]`.
pub fn segments(url: &str) -> Vec<String> {
    let rest = url.trim().split_once("://").map_or(url.trim(), |(_, r)| r);
    let path = rest.split(['?', '#']).next().unwrap_or_default();
    path.split('/')
        .skip(1)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
        .collect()
}

/// The segment right after `word` in an address's path (`…/playlist/<id>`).
pub fn after(url: &str, word: &str) -> Option<String> {
    let segs = segments(url);
    let i = segs.iter().position(|s| s == word)?;
    segs.get(i + 1).cloned()
}

#[cfg(test)]
mod address_tests {
    use super::*;

    #[test]
    fn reads_addresses() {
        assert_eq!(
            host("https://www.deezer.com/fr/playlist/123?utm=1").as_deref(),
            Some("deezer.com")
        );
        assert_eq!(
            host("open.spotify.com/playlist/x").as_deref(),
            Some("open.spotify.com")
        );
        assert_eq!(
            after("https://www.deezer.com/fr/playlist/123?utm=1", "playlist").as_deref(),
            Some("123")
        );
        assert_eq!(
            after("https://deezer.com/playlist/9/", "playlist").as_deref(),
            Some("9")
        );
        assert_eq!(after("https://deezer.com/album/9", "playlist"), None);
    }
}
