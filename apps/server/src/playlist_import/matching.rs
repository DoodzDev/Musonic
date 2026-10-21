//! Finding a song of another service in Musonic (ADR-020 § 4): in the library first (ISRC, else
//! title, artists and length), then in the online catalog (Deezer), where it becomes a track
//! without a file like any online song.

use anyhow::Result;
use rusqlite::{Connection, OptionalExtension};

use super::SourceTrack;
use crate::{
    matcher::{artists_overlap, core_title, normalize, normalize_artists, same_title},
    online::{Deezer, deezer::DzTrack, store},
    server::AppState,
};

/// Length difference for a sure match, in the library and online.
const SURE_MS: i64 = 5_000;
/// In the library: same title and artists, lengths this close.
const LIBRARY_MS: i64 = 3_000;
/// Online: same title and artists, but lengths this far apart: probably another version.
const UNCERTAIN_MS: i64 = 20_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Found {
    /// A library track with a file.
    Library(String),
    /// A track without a file (online), imported like any song put in a playlist.
    Online(String),
    /// Probably the song, but not surely (another length): kept, and shown as such.
    Uncertain(String),
    /// `not_found`, `online_not_allowed`.
    Missing(&'static str),
}

impl Found {
    pub fn status(&self) -> &'static str {
        match self {
            Self::Library(_) => "library",
            Self::Online(_) => "online",
            Self::Uncertain(_) => "uncertain",
            Self::Missing(_) => "missing",
        }
    }

    pub fn track(&self) -> Option<&str> {
        match self {
            Self::Library(id) | Self::Online(id) | Self::Uncertain(id) => Some(id),
            Self::Missing(_) => None,
        }
    }

    pub fn reason(&self) -> Option<&'static str> {
        match self {
            Self::Missing(r) => Some(r),
            _ => None,
        }
    }
}

fn has_file(c: &Connection, track: &str) -> rusqlite::Result<bool> {
    c.prepare_cached(
        "SELECT EXISTS (SELECT 1 FROM track_file WHERE track_id = ?1 AND missing = 0)",
    )?
    .query_row([track], |r| r.get(0))
}

fn close(a: Option<i64>, b: i64, within: i64) -> bool {
    a.is_none_or(|a| b <= 0 || (a - b).abs() <= within)
}

/// The library track that is this song, preferring one with a file.
pub fn in_library(c: &Connection, t: &SourceTrack) -> rusqlite::Result<Option<String>> {
    if let Some(isrc) = t.isrc.as_deref().filter(|i| !i.is_empty()) {
        let hit: Option<String> = c
            .prepare_cached(
                "SELECT t.id FROM track t WHERE t.isrc = ?1
                  ORDER BY EXISTS (SELECT 1 FROM track_file f WHERE f.track_id = t.id AND f.missing = 0) DESC
                  LIMIT 1",
            )?
            .query_row([isrc], |r| r.get(0))
            .optional()?;
        if hit.is_some() {
            return Ok(hit);
        }
    }
    let want = normalize_artists(t.artists.iter().map(String::as_str));
    let (full, core) = (normalize(&t.title), core_title(&t.title));
    if full.is_empty() {
        return Ok(None);
    }
    let mut st = c.prepare_cached(
        "SELECT t.id, t.title, t.norm_artists, t.duration_ms,
                EXISTS (SELECT 1 FROM track_file f WHERE f.track_id = t.id AND f.missing = 0)
           FROM track t
          WHERE t.norm_title = ?1 OR t.norm_title = ?2 OR (?2 <> '' AND t.norm_title LIKE ?2 || ' %')
          LIMIT 200",
    )?;
    let rows = st.query_map([&full, &core], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, String>(2)?,
            r.get::<_, i64>(3)?,
            r.get::<_, bool>(4)?,
        ))
    })?;
    let mut best: Option<(bool, i64, String)> = None;
    for row in rows {
        let (id, title, artists, duration, file) = row?;
        let theirs: Vec<String> = artists
            .split('|')
            .filter(|a| !a.is_empty())
            .map(str::to_owned)
            .collect();
        if !same_title(&t.title, &title)
            || (!want.is_empty() && !artists_overlap(&want, &theirs))
            || !close(t.duration_ms, duration, LIBRARY_MS)
        {
            continue;
        }
        let gap = t.duration_ms.map_or(0, |d| (d - duration).abs());
        let better = best
            .as_ref()
            .is_none_or(|(f, g, _)| (file, -gap) > (*f, -*g));
        if better {
            best = Some((file, gap, id));
        }
    }
    Ok(best.map(|(_, _, id)| id))
}

/// The best Deezer search result for this song, and whether it is surely the same.
pub fn pick(results: &[DzTrack], t: &SourceTrack) -> Option<(DzTrack, bool)> {
    let want = normalize_artists(t.artists.iter().map(String::as_str));
    let exact = normalize(&t.title);
    let mut best: Option<((bool, bool, i64), &DzTrack)> = None;
    for r in results.iter().filter(|r| r.id > 0) {
        if !same_title(&r.title, &t.title) {
            continue;
        }
        let theirs = normalize_artists(r.artists().iter().map(|a| a.name.as_str()));
        if !want.is_empty() && !artists_overlap(&want, &theirs) {
            continue;
        }
        let gap = t.duration_ms.map_or(0, |d| (d - r.duration * 1000).abs());
        if gap > UNCERTAIN_MS {
            continue;
        }
        let key = (gap <= SURE_MS, normalize(&r.title) == exact, -gap);
        if best.as_ref().is_none_or(|(k, _)| key > *k) {
            best = Some((key, r));
        }
    }
    best.map(|((sure, _, _), r)| (r.clone(), sure))
}

/// Looks the song up in the online catalog.
async fn search(dz: &Deezer, t: &SourceTrack) -> Result<Option<(DzTrack, bool)>> {
    let core = core_title(&t.title);
    let title = if core.is_empty() {
        normalize(&t.title)
    } else {
        core
    };
    let mut queries = Vec::new();
    if let Some(artist) = t
        .artists
        .first()
        .map(|a| normalize(a))
        .filter(|a| !a.is_empty())
    {
        queries.push(format!("artist:\"{artist}\" track:\"{title}\""));
        queries.push(format!("{artist} {title}"));
    } else {
        queries.push(title);
    }
    let mut uncertain = None;
    for q in queries {
        let results = dz.search_tracks(&q, 15).await?;
        match pick(&results, t) {
            Some((r, true)) => return Ok(Some((r, true))),
            Some(found) if uncertain.is_none() => uncertain = Some(found),
            _ => {}
        }
    }
    Ok(uncertain)
}

/// Finds one song. `source`: the service it comes from (`deezer` songs carry their catalog id).
pub async fn find(
    state: &AppState,
    source: &str,
    t: &SourceTrack,
    can_online: bool,
) -> Result<Found> {
    let deezer_id: Option<u64> = (source == "deezer")
        .then(|| t.id.as_deref()?.parse().ok())
        .flatten();
    let song = t.clone();
    let known = state
        .db
        .call(move |c| {
            let id = match deezer_id {
                Some(n) => store::known_track(c, n)?,
                None => None,
            };
            let id = match id {
                Some(id) => Some(id),
                None => in_library(c, &song)?,
            };
            Ok(match id {
                Some(id) => Some((has_file(c, &id)?, id)),
                None => None,
            })
        })
        .await?;
    if let Some((file, id)) = known {
        return Ok(if file {
            Found::Library(id)
        } else {
            Found::Online(id)
        });
    }
    let Some(dz) = state.online.as_deref().filter(|_| can_online) else {
        return Ok(Found::Missing("online_not_allowed"));
    };
    let (found, sure) = match deezer_id {
        Some(n) => match dz.track(n).await? {
            Some(full) => (full, true),
            None => return Ok(Found::Missing("not_found")),
        },
        None => match search(dz, t).await? {
            // The full song (ISRC, every artist) before it is stored.
            Some((r, sure)) => (dz.track(r.id).await?.unwrap_or(r), sure),
            None => return Ok(Found::Missing("not_found")),
        },
    };
    let (file, id) = state
        .db
        .call(move |c| {
            let tx = c.transaction()?;
            let id = store::store_track(&tx, &found)?;
            let file = has_file(&tx, &id)?;
            tx.commit()?;
            Ok((file, id))
        })
        .await?;
    Ok(match (sure, file) {
        (false, _) => Found::Uncertain(id),
        (true, true) => Found::Library(id),
        (true, false) => Found::Online(id),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::online::deezer::DzArtist;

    fn dz(id: u64, title: &str, artist: &str, secs: i64) -> DzTrack {
        DzTrack {
            id,
            title: title.into(),
            duration: secs,
            artist: Some(DzArtist {
                id: id + 1000,
                name: artist.into(),
                ..Default::default()
            }),
            ..Default::default()
        }
    }

    fn song(title: &str, artists: &[&str], ms: Option<i64>) -> SourceTrack {
        SourceTrack {
            title: title.into(),
            artists: artists.iter().map(|a| (*a).to_owned()).collect(),
            duration_ms: ms,
            ..Default::default()
        }
    }

    #[test]
    fn picks_the_same_song_online() {
        let results = [
            dz(1, "Get Lucky (Radio Edit)", "Daft Punk", 248),
            dz(2, "Get Lucky", "Someone Else", 369),
            dz(3, "Get Lucky", "Daft Punk", 369),
        ];
        let want = song(
            "Get Lucky (feat. Pharrell Williams)",
            &["Daft Punk", "Pharrell Williams"],
            Some(369_000),
        );
        let (t, sure) = pick(&results, &want).unwrap();
        assert_eq!((t.id, sure), (3, true));
        // Only another length: uncertain.
        let (t, sure) = pick(
            &results[..1],
            &song("Get Lucky", &["Daft Punk"], Some(260_000)),
        )
        .unwrap();
        assert_eq!((t.id, sure), (1, false));
        assert!(pick(&results, &song("Robot Rock", &["Daft Punk"], None)).is_none());
        assert!(
            pick(
                &results[..1],
                &song("Get Lucky", &["Daft Punk"], Some(300_000))
            )
            .is_none()
        );
    }

    #[test]
    fn finds_library_songs() {
        let db = crate::db::Db::memory().unwrap();
        let c = db.lock();
        let add = |id: &str, title: &str, artists: &str, ms: i64, isrc: Option<&str>| {
            c.execute(
                "INSERT INTO track(id, title, norm_title, norm_artists, duration_ms, isrc) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![id, title, normalize(title), artists, ms, isrc],
            )
            .unwrap();
        };
        add(
            "a",
            "Harder, Better, Faster, Stronger",
            "daft punk",
            224_000,
            None,
        );
        add(
            "b",
            "One More Time (Radio Edit)",
            "daft punk",
            320_000,
            None,
        );
        add("c", "Halo", "beyonce", 261_000, Some("USSM10804556"));
        let s = song(
            "Harder Better Faster Stronger",
            &["Daft Punk"],
            Some(225_500),
        );
        assert_eq!(in_library(&c, &s).unwrap().as_deref(), Some("a"));
        let s = song("One More Time", &["Daft Punk"], Some(321_000));
        assert_eq!(in_library(&c, &s).unwrap().as_deref(), Some("b"));
        let mut s = song("Something else", &["x"], None);
        s.isrc = Some("USSM10804556".into());
        assert_eq!(in_library(&c, &s).unwrap().as_deref(), Some("c"));
        assert_eq!(
            in_library(
                &c,
                &song("Harder Better Faster Stronger", &["Justice"], None)
            )
            .unwrap(),
            None
        );
        assert_eq!(
            in_library(&c, &song("One More Time", &["Daft Punk"], Some(200_000))).unwrap(),
            None
        );
    }
}

#[cfg(test)]
mod live {
    use super::*;

    /// Against the real Deezer (network): `cargo test live -- --ignored --nocapture`.
    #[tokio::test]
    #[ignore]
    async fn finds_songs_with_guests() {
        let dz = Deezer::new(crate::online::deezer::DEFAULT_URL).unwrap();
        for (title, artists, ms) in [
            (
                "expectations (feat. Chappell Roan)",
                vec!["Olivia Rodrigo", "Chappell Roan"],
                223_935,
            ),
            ("Dai Dai", vec!["Shakira", "Burna Boy"], 223_000),
            (
                "Solar Eclipse (feat. Don Toliver)",
                vec!["Drake", "Don Toliver"],
                218_000,
            ),
        ] {
            let t = SourceTrack {
                title: title.into(),
                artists: artists.iter().map(|a| a.to_string()).collect(),
                duration_ms: Some(ms),
                ..Default::default()
            };
            let r = search(&dz, &t).await.unwrap();
            println!("{title}: {:?}", r.map(|(t, s)| (t.id, t.title, s)));
        }
    }
}
