//! Deezer playlists, from the public API: every song of a public playlist, with its Deezer id
//! (the online catalog's), so finding it is exact.

use std::sync::Arc;

use async_trait::async_trait;

use super::{MAX_TRACKS, PlaylistSource, SourceError, SourcePlaylist, SourceTrack, after, host};
use crate::online::{Deezer, deezer::DzTrack};

pub struct DeezerPlaylists {
    dz: Arc<Deezer>,
}

impl DeezerPlaylists {
    pub fn new(dz: Arc<Deezer>) -> Self {
        Self { dz }
    }
}

fn is_short_link(host: &str) -> bool {
    host == "link.deezer.com" || host == "deezer.page.link" || host == "dzr.page.link"
}

fn playlist_id(url: &str) -> Option<u64> {
    let h = host(url)?;
    if !h.ends_with("deezer.com") {
        return None;
    }
    after(url, "playlist")?.parse().ok()
}

pub fn track_of(t: &DzTrack) -> SourceTrack {
    SourceTrack {
        title: t.title.clone(),
        artists: t.artists().iter().map(|a| a.name.clone()).collect(),
        album: t
            .album
            .as_ref()
            .map(|a| a.title.clone())
            .filter(|a| !a.is_empty()),
        duration_ms: (t.duration > 0).then_some(t.duration * 1000),
        isrc: t.isrc.clone().filter(|i| !i.is_empty()),
        link: Some(format!("https://www.deezer.com/track/{}", t.id)),
        id: Some(t.id.to_string()),
    }
}

#[async_trait]
impl PlaylistSource for DeezerPlaylists {
    fn id(&self) -> &'static str {
        "deezer"
    }

    fn knows(&self, url: &str) -> bool {
        host(url).is_some_and(|h| h.ends_with("deezer.com") || is_short_link(&h))
    }

    async fn playlist(&self, url: &str) -> Result<SourcePlaylist, SourceError> {
        let h = host(url).ok_or(SourceError::NotMine)?;
        let url = if is_short_link(&h) {
            let full = if url.contains("://") {
                url.to_owned()
            } else {
                format!("https://{url}")
            };
            self.dz.follow(&full).await?
        } else {
            url.to_owned()
        };
        let id = playlist_id(&url).ok_or(SourceError::NotMine)?;
        let pl = self.dz.playlist(id).await?.ok_or(SourceError::NotFound)?;
        let tracks = self.dz.playlist_tracks(id, MAX_TRACKS).await?;
        Ok(SourcePlaylist {
            source: "deezer".into(),
            id: Some(id.to_string()),
            name: pl.title,
            owner: pl.creator.map(|c| c.name).filter(|n| !n.is_empty()),
            cover_url: pl.picture_xl,
            total: pl.nb_tracks.map(|n| n.max(0) as u32),
            tracks: tracks.iter().filter(|t| t.id > 0).map(track_of).collect(),
            app_link: None,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_playlist_id() {
        assert_eq!(
            playlist_id("https://www.deezer.com/fr/playlist/1479458365?host=1"),
            Some(1479458365)
        );
        assert_eq!(playlist_id("deezer.com/playlist/42"), Some(42));
        assert_eq!(playlist_id("https://open.spotify.com/playlist/42"), None);
        assert_eq!(playlist_id("https://www.deezer.com/fr/album/42"), None);
        assert!(is_short_link("link.deezer.com"));
    }
}
