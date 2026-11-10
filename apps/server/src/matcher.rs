//! Text normalization and fuzzy comparison used to match the same track across providers.

use unicode_normalization::UnicodeNormalization;

/// Lowercase, strip accents and punctuation, collapse spaces.
pub fn normalize(text: &str) -> String {
    let folded: String = text
        .to_lowercase()
        .nfkd()
        .filter(|c| c.is_ascii_alphanumeric() || c.is_whitespace())
        .collect();
    folded.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Title split into its core and the extras around it: "(feat. …)", "[Remastered]",
/// " - Radio Edit"…
fn split_title(title: &str) -> (String, String) {
    let mut t = title.to_owned();
    let mut extras = String::new();
    for (open, close) in [('(', ')'), ('[', ']')] {
        while let (Some(a), Some(b)) = (t.find(open), t.find(close)) {
            if b <= a {
                break;
            }
            extras.push(' ');
            extras.push_str(&t[a + 1..b]);
            t.replace_range(a..=b, " ");
        }
    }
    if let Some(i) = t.find(" - ") {
        extras.push(' ');
        extras.push_str(&t[i + 3..]);
        t.truncate(i);
    }
    (t, extras)
}

/// Title without "(feat. …)", "[Remastered]", " - Radio Edit"… used as a second chance.
pub fn core_title(title: &str) -> String {
    normalize(&split_title(title).0)
}

/// Extras that name another recording: "Song (Live)" or "Song - Acoustic" is not "Song",
/// while "(Radio Edit)", "(feat. …)" or "- Remastered" are the same song.
const VERSION_WORDS: &[&str] = &[
    "live",
    "remix",
    "rmx",
    "acoustic",
    "unplugged",
    "instrumental",
    "karaoke",
    "acapella",
    "demo",
    "cover",
    "reprise",
    "slowed",
    "nightcore",
];
const VERSION_PHRASES: &[&str] = &["a cappella", "sped up"];

/// The version words found in the extras of `title` (never in its core: "Live Forever" is
/// not a live version), sorted.
pub fn version_tags(title: &str) -> Vec<&'static str> {
    let extras = format!(" {} ", normalize(&split_title(title).1));
    let mut tags: Vec<&'static str> = VERSION_WORDS
        .iter()
        .chain(VERSION_PHRASES)
        .copied()
        .filter(|w| extras.contains(&format!(" {w} ")))
        .collect();
    tags.sort_unstable();
    tags
}

pub fn normalize_artists<'a>(names: impl IntoIterator<Item = &'a str>) -> Vec<String> {
    let mut v: Vec<String> = names
        .into_iter()
        .map(normalize)
        .filter(|n| !n.is_empty())
        .collect();
    v.sort();
    v.dedup();
    v
}

pub fn similar(a: &str, b: &str) -> bool {
    ratio(a, b) >= 0.85
}

pub fn ratio(a: &str, b: &str) -> f64 {
    let max = a.chars().count().max(b.chars().count());
    if max == 0 {
        return 1.0;
    }
    1.0 - strsim::levenshtein(a, b) as f64 / max as f64
}

/// Same song title: the same version words, and close enough as-is or once versions and
/// featurings are removed.
pub fn same_title(a: &str, b: &str) -> bool {
    if version_tags(a) != version_tags(b) {
        return false;
    }
    similar(&normalize(a), &normalize(b)) || {
        let (ca, cb) = (core_title(a), core_title(b));
        !ca.is_empty() && ca == cb
    }
}

/// At least one artist in common (fuzzy), so "A feat. B" still matches "A". Spaces do not
/// count: "JAŸ-Z" (normalized "jayz") is "JAY Z".
pub fn artists_overlap(a: &[String], b: &[String]) -> bool {
    let compact = |s: &str| s.replace(' ', "");
    a.iter().any(|x| {
        b.iter()
            .any(|y| similar(x, y) || similar(&compact(x), &compact(y)))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes() {
        assert_eq!(normalize("  Beyoncé — Halo!! "), "beyonce halo");
        assert_eq!(normalize("Ça va?"), "ca va");
    }

    #[test]
    fn core_titles() {
        assert_eq!(core_title("One More Time (Radio Edit)"), "one more time");
        assert_eq!(
            core_title("Get Lucky [feat. Pharrell] - Remastered 2013"),
            "get lucky"
        );
    }

    #[test]
    fn versions_are_other_recordings() {
        assert!(!same_title("Song (Live)", "Song"));
        assert!(!same_title("Song (Remix)", "Song"));
        assert!(!same_title("Song - Acoustic", "Song"));
        assert!(!same_title("Song (Sped Up)", "Song"));
        assert!(!same_title("Song (Live)", "Song (Acoustic)"));
        assert!(same_title("Song (Live)", "Song - Live"));
        assert!(same_title("Song (Radio Edit)", "Song"));
        assert!(same_title("Song [feat. Someone] - Remastered 2011", "Song"));
        // A version word in the title itself is not a version.
        assert!(same_title("Live Forever", "Live Forever - Remastered"));
        assert_eq!(
            version_tags("Song (A Cappella) [Live]"),
            vec!["a cappella", "live"]
        );
    }

    #[test]
    fn titles_and_artists() {
        assert!(same_title(
            "Harder, Better, Faster, Stronger",
            "Harder Better Faster Stronger"
        ));
        assert!(same_title("D.A.N.C.E. (Radio Edit)", "D.A.N.C.E."));
        assert!(!same_title("Robot Rock", "Aerodynamic"));
        let a = normalize_artists(["Daft Punk", "Pharrell Williams"]);
        let b = normalize_artists(["Daft Punk"]);
        assert!(artists_overlap(&a, &b));
        assert!(!artists_overlap(&b, &normalize_artists(["Justice"])));
        assert!(artists_overlap(
            &normalize_artists(["JAŸ-Z"]),
            &normalize_artists(["JAY Z"])
        ));
    }
}
