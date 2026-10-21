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

/// Title without "(feat. …)", "[Remastered]", " - Radio Edit"… used as a second chance.
pub fn core_title(title: &str) -> String {
    let mut t = title.to_owned();
    for (open, close) in [('(', ')'), ('[', ']')] {
        while let (Some(a), Some(b)) = (t.find(open), t.find(close)) {
            if b <= a {
                break;
            }
            t.replace_range(a..=b, " ");
        }
    }
    if let Some(i) = t.find(" - ") {
        t.truncate(i);
    }
    normalize(&t)
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

/// Same song title: close enough as-is, or once versions/featurings are removed.
pub fn same_title(a: &str, b: &str) -> bool {
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
