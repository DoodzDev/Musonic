//! `search3` / `search2`: full-text search on titles and artists (accents and case ignored,
//! each word matched as a prefix: "hopp sig" finds "Hoppípolla – Sigur Rós"). An empty query
//! lists everything, which some clients use to sync the whole library. With the online
//! catalog, results beyond the library follow the library's (see [`super::online`]).

use serde_json::{Value, json};

use super::{Ctx, Reply, model, one, online};

/// `"hopp" "sig"*`-style FTS5 query: each word quoted (no operator injection) and prefixed.
fn fts_query(q: &str) -> Option<String> {
    let words: Vec<String> = q
        .split(|c: char| !c.is_alphanumeric() && c != '\'')
        .filter(|w| !w.is_empty())
        .map(|w| format!("\"{}\"*", w.replace('"', "")))
        .collect();
    (!words.is_empty()).then(|| words.join(" "))
}

fn number(ctx: &Ctx, name: &str, default: i64) -> i64 {
    ctx.params
        .get(name)
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
        .clamp(0, 500)
}

pub async fn search(ctx: &Ctx, key: &str) -> Reply {
    let raw = ctx
        .params
        .get("query")
        .unwrap_or_default()
        .trim()
        .trim_matches('"')
        .to_owned();
    let query = fts_query(&raw);
    let (ac, ao) = (
        number(ctx, "artistCount", 20),
        number(ctx, "artistOffset", 0).max(0),
    );
    let (lc, lo) = (
        number(ctx, "albumCount", 20),
        number(ctx, "albumOffset", 0).max(0),
    );
    let (sc, so) = (
        number(ctx, "songCount", 20),
        number(ctx, "songOffset", 0).max(0),
    );
    let user = ctx.user.id.clone();
    let has_query = query.is_some();
    let (mut artists, mut albums, mut songs) = ctx
        .state
        .db
        .call(move |c| {
            let page = "LIMIT ?2 OFFSET ?3";
            let (artists, albums, songs): (Vec<Value>, Vec<Value>, Vec<Value>) = match &query {
                Some(q) => (
                    model::artists(
                        c,
                        "ar.rowid IN (SELECT rowid FROM artist_fts WHERE artist_fts MATCH ?4)",
                        "ar.name COLLATE NOCASE",
                        page,
                        &[&user, &ac, &ao, q],
                    )?,
                    model::albums(
                        c,
                        "al.rowid IN (SELECT rowid FROM album_fts WHERE album_fts MATCH ?4)",
                        "al.title COLLATE NOCASE",
                        page,
                        &[&user, &lc, &lo, q],
                    )?,
                    model::songs(
                        c,
                        &format!("{} AND t.rowid IN (SELECT rowid FROM track_fts WHERE track_fts MATCH ?4)", model::HAS_FILE),
                        "t.title COLLATE NOCASE LIMIT ?2 OFFSET ?3",
                        &[&user, &sc, &so, q],
                    )?,
                ),
                None => (
                    model::artists(c, "1", "ar.name COLLATE NOCASE", page, &[&user, &ac, &ao])?,
                    model::albums(c, "1", "al.title COLLATE NOCASE", page, &[&user, &lc, &lo])?,
                    model::songs(
                        c,
                        model::HAS_FILE,
                        "t.title COLLATE NOCASE LIMIT ?2 OFFSET ?3",
                        &[&user, &sc, &so],
                    )?,
                ),
            };
            Ok((artists, albums, songs))
        })
        .await?;
    // Online results after the library's, on the first page of each kind.
    if has_query {
        let counts = (
            if ao == 0 { ac } else { 0 },
            if lo == 0 { lc } else { 0 },
            if so == 0 { sc } else { 0 },
        );
        let (more_artists, more_albums, more_songs) =
            online::search_more(ctx, &raw, counts, (&artists, &albums, &songs)).await;
        artists.extend(more_artists);
        albums.extend(more_albums);
        songs.extend(more_songs);
    }
    Ok(one(
        key,
        json!({ "artist": artists, "album": if key == "searchResult2" {
            let mut albums = albums;
            model::as_child(&mut albums);
            albums
        } else {
            albums
        }, "song": songs }),
    ))
}

#[cfg(test)]
mod tests {
    use super::fts_query;

    #[test]
    fn builds_safe_prefix_queries() {
        assert_eq!(fts_query("hopp sig").as_deref(), Some("\"hopp\"* \"sig\"*"));
        assert_eq!(
            fts_query("AC/DC \"OR\" NEAR(").as_deref(),
            Some("\"AC\"* \"DC\"* \"OR\"* \"NEAR\"*")
        );
        assert_eq!(fts_query("  -- "), None);
    }
}
