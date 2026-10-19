//! Identifiers.
//!
//! - Tracks: a random UUID given once (canonical id), kept across rescans, moves and imports.
//! - Albums and artists: derived from what identifies them (tags), so a rescan gives the same
//!   id without looking anything up.
//! - Persistent ids (`pid`): what makes two files "the same track" or "the same album".

use uuid::Uuid;

use crate::matcher::normalize;

/// Fixed namespace of Musonic ids (UUID v5).
const NAMESPACE: Uuid = Uuid::from_u128(0x6d75_736f_6e69_6300_8000_0000_0000_0001);

fn derived(kind: &str, key: &str) -> String {
    Uuid::new_v5(&NAMESPACE, format!("{kind}\u{1f}{key}").as_bytes()).to_string()
}

pub fn new_track_id() -> String {
    Uuid::new_v4().to_string()
}

pub fn new_id() -> String {
    Uuid::new_v4().to_string()
}

/// Same name (ignoring case, accents and punctuation) = same artist.
pub fn artist_id(name: &str) -> String {
    derived("artist", &normalize(name))
}

/// MusicBrainz release id when the file has one, else album artist + album title.
pub fn album_pid(mbid: Option<&str>, album_artist: &str, title: &str) -> String {
    match mbid {
        Some(m) if !m.is_empty() => format!("mb:{m}"),
        _ => format!("{}\u{1f}{}", normalize(album_artist), normalize(title)),
    }
}

pub fn album_id(pid: &str) -> String {
    derived("album", pid)
}

/// MusicBrainz recording id when the file has one, else album + disc + track number + title.
pub fn track_pid(
    mbid: Option<&str>,
    album_pid: &str,
    disc: Option<u32>,
    track: Option<u32>,
    title: &str,
) -> String {
    match mbid {
        Some(m) if !m.is_empty() => format!("mb:{m}"),
        _ => format!(
            "{album_pid}\u{1f}{}\u{1f}{}\u{1f}{}",
            disc.unwrap_or(1),
            track.unwrap_or(0),
            normalize(title)
        ),
    }
}

pub fn folder_id(library_id: i64, path: &str) -> String {
    derived("folder", &format!("{library_id}\u{1f}{path}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derived_ids_are_stable_and_loose_on_spelling() {
        assert_eq!(artist_id("Sigur Rós"), artist_id("sigur ros"));
        assert_ne!(artist_id("Sigur Rós"), artist_id("Björk"));
        let a = album_pid(None, "Daft Punk", "Discovery");
        assert_eq!(a, album_pid(None, "DAFT PUNK", "Discovery!"));
        assert_eq!(album_id(&a), album_id(&a));
        assert_eq!(album_pid(Some("x-1"), "Any", "Thing"), "mb:x-1");
    }

    #[test]
    fn track_pids_tell_versions_apart() {
        let album = album_pid(None, "Daft Punk", "Discovery");
        let single = album_pid(None, "Daft Punk", "One More Time");
        let t1 = track_pid(None, &album, Some(1), Some(1), "One More Time");
        assert_eq!(t1, track_pid(None, &album, None, Some(1), "one more time"));
        assert_ne!(
            t1,
            track_pid(None, &single, Some(1), Some(1), "One More Time")
        );
        assert_ne!(new_track_id(), new_track_id());
    }
}
