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
/// Same work, another recording (classical music: the same piece by another orchestra lasts
/// a minute more or less): still a stand-in, shown as uncertain.
const OTHER_RECORDING_MS: i64 = 90_000;

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

/// Tracks clients show: a file, or an online source (see `subsonic::model::PLAYABLE`).
const SHOWN: &str = "(EXISTS (SELECT 1 FROM track_file f WHERE f.track_id = t.id AND f.missing = 0)
      OR EXISTS (SELECT 1 FROM track_source s WHERE s.track_id = t.id))";

/// The library track that is this song, preferring one with a file. Tracks clients do not show
/// (no file and no online source, e.g. left by an old import) are skipped: the song is then
/// looked for online, which links its source to that same track.
pub fn in_library(c: &Connection, t: &SourceTrack) -> rusqlite::Result<Option<String>> {
    if let Some(isrc) = t.isrc.as_deref().filter(|i| !i.is_empty()) {
        let hit: Option<String> = c
            .prepare_cached(&format!(
                "SELECT t.id FROM track t WHERE t.isrc = ?1 AND {SHOWN}
                  ORDER BY EXISTS (SELECT 1 FROM track_file f WHERE f.track_id = t.id AND f.missing = 0) DESC
                  LIMIT 1"
            ))?
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
    let mut st = c.prepare_cached(&format!(
        "SELECT t.id, t.title, t.norm_artists, t.duration_ms,
                EXISTS (SELECT 1 FROM track_file f WHERE f.track_id = t.id AND f.missing = 0)
           FROM track t
          WHERE (t.norm_title = ?1 OR t.norm_title = ?2 OR (?2 <> '' AND t.norm_title LIKE ?2 || ' %'))
            AND {SHOWN}
          LIMIT 200"
    ))?;
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

/// Words of a title made from another one (arrangements, covers, karaoke…).
const DERIVED: &[&str] = &[
    "apres",
    "after",
    "arr",
    "arranged",
    "arrangement",
    "cover",
    "covers",
    "karaoke",
    "tribute",
    "inspired",
    "originally",
    "famous",
    "lullaby",
    "rendition",
    "style",
    "medley",
];

/// Words that say little about a title (in the languages playlists use most).
const FILLER: &[&str] = &[
    "the",
    "a",
    "an",
    "of",
    "in",
    "and",
    "for",
    "from",
    "with",
    "feat",
    "ft",
    "remastered",
    "remaster",
    "version",
    "edit",
    "radio",
    "live",
    "le",
    "la",
    "les",
    "de",
    "des",
    "du",
    "en",
    "et",
    "un",
    "une",
    "der",
    "die",
    "das",
    "und",
    "von",
    "il",
    "el",
    "y",
    "op",
    "no",
    "nr",
    "n",
    "major",
    "minor",
    "majeur",
    "mineur",
];

/// The words of a title worth comparing (numbers kept: « No. 40 », « Op. 9 » tell works apart).
fn words(title: &str) -> Vec<String> {
    let mut out: Vec<String> = normalize(title)
        .split_whitespace()
        .filter(|w| !FILLER.contains(w) && (w.len() > 1 || w.chars().all(|c| c.is_ascii_digit())))
        // Years (« Remastered 2011 ») are not the title.
        .filter(|w| {
            !(w.len() == 4 && w.starts_with(['1', '2']) && w.chars().all(|c| c.is_ascii_digit()))
        })
        .map(str::to_owned)
        .collect();
    out.sort();
    out.dedup();
    out
}

/// Part of the source title's words found in the result's title (0 to 1).
fn covered(source: &[String], result: &str) -> f64 {
    if source.is_empty() {
        return 0.0;
    }
    let theirs = words(result);
    let n = source
        .iter()
        .filter(|w| {
            theirs
                .iter()
                .any(|t| t == *w || (w.len() > 4 && crate::matcher::similar(t, w)))
        })
        .count();
    n as f64 / source.len() as f64
}

/// The song's artists are the result's, or one of them (a composer) is named in its title.
fn same_artists(want: &[String], r: &DzTrack) -> bool {
    let theirs = normalize_artists(r.artists().iter().map(|a| a.name.as_str()));
    if want.is_empty() || artists_overlap(want, &theirs) {
        return true;
    }
    let title = normalize(&r.title);
    want.iter().any(|a| {
        a.split_whitespace()
            .last()
            .is_some_and(|last| last.len() >= 4 && title.split_whitespace().any(|w| w == last))
    })
}

/// The best Deezer search result for this song, and whether it is surely the same. Not sure
/// (« uncertain »): another recording of the same work or song, close enough to stand in.
pub fn pick(results: &[DzTrack], t: &SourceTrack) -> Option<(DzTrack, bool)> {
    let want = normalize_artists(t.artists.iter().map(String::as_str));
    let exact = normalize(&t.title);
    let source = words(&t.title);
    let mut best: Option<((bool, i64, i64), &DzTrack)> = None;
    let split = |s: &str| normalize(&s.replace(['\'', '’'], " "));
    let source_all = split(&t.title);
    for r in results.iter().filter(|r| r.id > 0) {
        // Another piece made from it (« Études d'après la 5ème symphonie », a karaoke…).
        let theirs = split(&r.title);
        if DERIVED.iter().any(|d| {
            theirs.split_whitespace().any(|w| w == *d)
                && !source_all.split_whitespace().any(|w| w == *d)
        }) {
            continue;
        }
        let same = same_title(&r.title, &t.title);
        let cover = covered(&source, &r.title);
        let artists = same_artists(&want, r);
        let gap = t.duration_ms.map_or(0, |d| (d - r.duration * 1000).abs());
        let sure = artists && ((same && gap <= SURE_MS) || (cover >= 0.8 && gap <= 3_000));
        let close = (artists && (same || cover >= 0.6) && gap <= UNCERTAIN_MS)
            || (artists && (same || cover >= 0.75) && gap <= OTHER_RECORDING_MS)
            // The same work by the same composer, whatever its length (a whole symphony for one
            // movement, a suite for a piece): a stand-in, uncertain.
            || (artists && cover >= 0.85)
            || (same && gap <= SURE_MS)
            || (cover >= 0.8 && gap <= 3_000);
        if !sure && !close {
            continue;
        }
        let score = ((cover * 100.0) as i64)
            + i64::from(same) * 50
            + i64::from(normalize(&r.title) == exact) * 20
            + i64::from(artists) * 40;
        let key = (sure, score, -gap);
        if best.as_ref().is_none_or(|(k, _)| key > *k) {
            best = Some((key, r));
        }
    }
    best.map(|((sure, _, _), r)| (r.clone(), sure))
}

/// A title to search with: without « (feat. …) », « [Live] » nor « - Remastered 2011 »-like
/// endings, but keeping « Peer Gynt – Dans l'antre du roi de la montagne » whole.
fn query_title(title: &str) -> String {
    const VERSION: &[&str] = &[
        "remaster", "version", "edit", "live", "mix", "mono", "stereo", "from", "bonus", "single",
        "acoustic",
    ];
    let mut t = title.to_owned();
    for (open, close) in [('(', ')'), ('[', ']')] {
        while let (Some(a), Some(b)) = (t.find(open), t.find(close)) {
            if b <= a {
                break;
            }
            t.replace_range(a..=b, " ");
        }
    }
    let parts: Vec<String> = t
        .split(" - ")
        .enumerate()
        .filter(|(i, p)| *i == 0 || !VERSION.iter().any(|v| p.to_lowercase().contains(v)))
        .map(|(_, p)| p.to_owned())
        .collect();
    // « l'antre » searched as « l antre », not « lantre ».
    normalize(
        &parts
            .join(" ")
            .replace(['\'', '’', ':', ',', '.', '"', '/', '–', '—'], " "),
    )
}

/// What to search for: each credited artist (main one first, then the others: for classical
/// music the performers, who are Deezer's artists) with the title, then the title alone.
fn queries(t: &SourceTrack) -> Vec<String> {
    let core = query_title(&t.title);
    let mut title: Vec<&str> = core.split_whitespace().collect();
    if title.is_empty() {
        return Vec::new();
    }
    title.truncate(10);
    let title = title.join(" ");
    let mut out: Vec<String> = Vec::new();
    for a in t
        .artists
        .iter()
        .map(|a| normalize(a))
        .filter(|a| !a.is_empty())
        .take(3)
    {
        out.push(format!("{a} {title}"));
    }
    out.push(title);
    out.dedup();
    out
}

/// Looks the song up in the online catalog.
pub async fn search(dz: &Deezer, t: &SourceTrack) -> Result<Option<(DzTrack, bool)>> {
    let mut seen: Vec<DzTrack> = Vec::new();
    for q in queries(t) {
        for r in dz.search_tracks(&q, 15).await? {
            if !seen.iter().any(|s| s.id == r.id) {
                seen.push(r);
            }
        }
        if let Some((r, true)) = pick(&seen, t) {
            return Ok(Some((r, true)));
        }
    }
    Ok(pick(&seen, t))
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
        // Another recording a minute longer: a stand-in, uncertain.
        let (_, sure) = pick(
            &results[..1],
            &song("Get Lucky", &["Daft Punk"], Some(300_000)),
        )
        .unwrap();
        assert!(!sure);
        // Much longer: still the same song, a stand-in; another artist's song of that name: nothing.
        let (_, sure) = pick(
            &results[..1],
            &song("Get Lucky", &["Daft Punk"], Some(400_000)),
        )
        .unwrap();
        assert!(!sure);
        assert!(
            pick(
                &results[..1],
                &song("Get Lucky", &["Justice"], Some(400_000))
            )
            .is_none()
        );
        // Classical music: Deezer's artist is the performer, the composer is in the title.
        let mut grieg = dz(
            5,
            "Grieg: Peer Gynt Suite No. 1, Op. 46: IV. In the Hall of the Mountain King",
            "Berliner Philharmoniker",
            150,
        );
        grieg.contributors = Vec::new();
        let (t, sure) = pick(
            std::slice::from_ref(&grieg),
            &song(
                "Peer Gynt Suite No. 1, Op. 46: IV. In the Hall of the Mountain King",
                &["Edvard Grieg", "Herbert von Karajan"],
                Some(151_000),
            ),
        )
        .unwrap();
        assert_eq!((t.id, sure), (5, true));
    }

    #[test]
    fn search_titles_keep_the_piece() {
        assert_eq!(
            query_title("Peer Gynt – Dans l'antre du roi de la montagne"),
            "peer gynt dans l antre du roi de la montagne"
        );
        assert_eq!(
            query_title("Under Pressure - Remastered 2011"),
            "under pressure"
        );
        assert_eq!(
            query_title("expectations (feat. Chappell Roan)"),
            "expectations"
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
            // Shown in clients: known online.
            c.execute(
                "INSERT INTO track_source(provider, provider_id, track_id) VALUES ('deezer', ?1, ?1)",
                [id],
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
        // A track no client shows (no file, no online source) is not a match.
        c.execute(
            "INSERT INTO track(id, title, norm_title, norm_artists, duration_ms) VALUES ('ghost', 'Aerodynamic', 'aerodynamic', 'daft punk', 212000)",
            [],
        )
        .unwrap();
        assert_eq!(
            in_library(&c, &song("Aerodynamic", &["Daft Punk"], Some(212_000))).unwrap(),
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

#[cfg(test)]
mod derived {
    use super::*;
    use crate::online::deezer::DzArtist;

    #[test]
    fn pieces_made_from_another_are_not_it() {
        let r = |id: u64, title: &str, artist: &str, secs: i64| DzTrack {
            id,
            title: title.into(),
            duration: secs,
            artist: Some(DzArtist {
                id: id + 1000,
                name: artist.into(),
                ..Default::default()
            }),
            ..Default::default()
        };
        let song = SourceTrack {
            title: "5ème symphonie".into(),
            artists: vec!["Ludwig van Beethoven".into()],
            duration_ms: Some(420_000),
            ..Default::default()
        };
        let etude = r(
            1,
            "17 Etudes de concert: No. 10, d'après la 5ème symphonie de Beethoven",
            "Christophe Sturzenegger",
            300,
        );
        assert!(pick(std::slice::from_ref(&etude), &song).is_none());
        let real = r(
            2,
            "Beethoven: 5ème symphonie",
            "Wiener Philharmoniker",
            1900,
        );
        let (t, sure) = pick(&[etude, real], &song).unwrap();
        assert_eq!(
            (t.id, sure),
            (2, false),
            "the work itself, another length: uncertain"
        );
    }
}
