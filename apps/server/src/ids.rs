//! Identifiers.
//!
//! - Tracks: a random id given once (canonical id), kept across rescans, moves and imports.
//! - Albums, artists and folders: derived from what identifies them (tags, path), so a rescan
//!   gives the same id without looking anything up.
//! - Persistent ids (`pid`): what makes two files "the same track" or "the same album".
//!
//! What clients see (tracks, albums, artists, folders, playlists) is a short id: 64 bits in
//! base 62, 11 characters (ADR-026). Lists of thousands of items repeat them, and random ids do
//! not compress: a list of artists halves. Ids from before were UUIDs (or Navidrome's, after an
//! import); [`shorten`] computes the short id from them, so any old id clients kept still works.
//! Accounts, keys and links keep UUIDs: they never fill a list, and links must stay unguessable.

use uuid::Uuid;

use crate::matcher::normalize;

/// Fixed namespace of Musonic ids (UUID v5).
const NAMESPACE: Uuid = Uuid::from_u128(0x6d75_736f_6e69_6300_8000_0000_0000_0001);

const BASE62: &[u8; 62] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/// Length of a short id: 62^11 > 2^64.
pub const SHORT_LEN: usize = 11;

/// 64 bits in base 62, always [`SHORT_LEN`] characters.
fn base62(mut n: u64) -> String {
    let mut out = [b'0'; SHORT_LEN];
    for c in out.iter_mut().rev() {
        *c = BASE62[(n % 62) as usize];
        n /= 62;
    }
    String::from_utf8(out.to_vec()).expect("ASCII")
}

/// The short id of a UUID: its first 64 bits.
pub fn short(uuid: &Uuid) -> String {
    base62((uuid.as_u128() >> 64) as u64)
}

/// Length of the ids Navidrome gives (random base 62), kept by an import from Navidrome.
const NAVIDROME_LEN: usize = 22;

/// Prefixes of cover ids (`getCoverArt`): a playlist's own picture, an artist's picture.
const COVER_PREFIXES: [&str; 2] = ["pl-", "ar-"];

/// The current form of an id a client sent or a base kept: an old UUID becomes its first 64
/// bits, an id kept from Navidrome its first 11 characters (already random base 62), also
/// after a cover prefix (`pl-…`). Anything else (short ids, online ids such as
/// `dz-track-…`) is left as it is.
pub fn shorten(id: &str) -> std::borrow::Cow<'_, str> {
    for prefix in COVER_PREFIXES {
        if let Some(rest) = id.strip_prefix(prefix) {
            return match bare(rest) {
                std::borrow::Cow::Owned(short) => format!("{prefix}{short}").into(),
                std::borrow::Cow::Borrowed(_) => id.into(),
            };
        }
    }
    bare(id)
}

fn bare(id: &str) -> std::borrow::Cow<'_, str> {
    match Uuid::try_parse(id) {
        Ok(u) if id.len() == 36 => short(&u).into(),
        _ if id.len() == NAVIDROME_LEN && id.bytes().all(|b| b.is_ascii_alphanumeric()) => {
            id[..SHORT_LEN].to_owned().into()
        }
        _ => id.into(),
    }
}

fn derived(kind: &str, key: &str) -> String {
    short(&Uuid::new_v5(
        &NAMESPACE,
        format!("{kind}\u{1f}{key}").as_bytes(),
    ))
}

pub fn new_track_id() -> String {
    base62(rand::random())
}

pub fn new_playlist_id() -> String {
    base62(rand::random())
}

/// Accounts, keys, invitations, imports: not shown in lists, kept long.
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

/// A podcast show: derived from its feed address, so the same feed is one show for everyone.
pub fn podcast_id(feed_url: &str) -> String {
    format!("{PODCAST_PREFIX}{}", derived("podcast", feed_url.trim()))
}

/// An episode: derived from its show and its `guid` (stable across reads of the feed).
pub fn episode_id(podcast_id: &str, guid: &str) -> String {
    format!(
        "{EPISODE_PREFIX}{}",
        derived("episode", &format!("{podcast_id}\u{1f}{guid}"))
    )
}

/// Prefixes of podcast ids: `stream`, `getCoverArt`… tell them from library ids at a glance.
pub const PODCAST_PREFIX: &str = "pc-";
pub const EPISODE_PREFIX: &str = "pe-";

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

    #[test]
    fn short_ids_are_the_first_64_bits_of_the_old_uuids() {
        // The same vectors are checked by the clients' converter (packages/core).
        let u = "0c3c5e47-6f22-5dfe-ab18-9987368e4dac";
        assert_eq!(shorten(u), "1387MiQJoB4");
        assert_eq!(
            shorten("5220a049-bd94-47ae-8d35-2ca090cfb168"),
            "73A4WPDHD9a"
        );
        assert_eq!(shorten(u).len(), SHORT_LEN);
        assert_eq!(base62(0), "00000000000");
        assert_eq!(base62(u64::MAX), "LygHa16AHYF");
        assert_eq!(
            shorten(&shorten(u)),
            shorten(u),
            "short ids stay as they are"
        );
        assert_eq!(
            shorten("4xDzN7lF2pq1Hc0Ab9Zk3s"),
            "4xDzN7lF2pq",
            "kept from Navidrome"
        );
        assert_eq!(
            shorten(&format!("pl-{u}")),
            "pl-1387MiQJoB4",
            "cover of a playlist"
        );
        assert_eq!(shorten("ar-4xDzN7lF2pq1Hc0Ab9Zk3s"), "ar-4xDzN7lF2pq");
        assert_eq!(shorten("pl-1387MiQJoB4"), "pl-1387MiQJoB4");
        for kept in [
            "dz-track-1001",
            "dz-album-302127",
            "4xDzN7lF2pq1Hc0Ab9Zk3-",
            "",
        ] {
            assert_eq!(shorten(kept), kept);
        }
        assert_eq!(artist_id("Daft Punk").len(), SHORT_LEN);
        assert_eq!(new_track_id().len(), SHORT_LEN);
        assert_eq!(new_playlist_id().len(), SHORT_LEN);
    }
}
