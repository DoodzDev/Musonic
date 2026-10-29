//! Reading a podcast's RSS feed: the show and its episodes, only the fields Musonic uses.
//! Covers RSS 2.0 with the iTunes and Podcasting 2.0 tags most hosts publish.

use anyhow::{Result, bail};
use quick_xml::{Reader, events::Event};

/// Longest description kept: show notes can be whole web pages.
const DESCRIPTION_MAX: usize = 4000;

#[derive(Debug, Default, Clone, PartialEq)]
pub struct Show {
    pub title: String,
    pub author: Option<String>,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub link: Option<String>,
    pub language: Option<String>,
    pub episodes: Vec<Item>,
}

#[derive(Debug, Default, Clone, PartialEq)]
pub struct Item {
    /// The item's `guid`, else its audio address.
    pub guid: String,
    pub title: String,
    pub description: Option<String>,
    pub published_at: Option<i64>,
    pub duration_s: Option<i64>,
    pub audio_url: String,
    pub audio_size: Option<i64>,
    pub audio_type: Option<String>,
    pub image_url: Option<String>,
    pub chapters_url: Option<String>,
    pub transcript_url: Option<String>,
}

/// Reads a feed. Items without audio are skipped (they cannot be played).
pub fn parse(xml: &str) -> Result<Show> {
    let mut reader = Reader::from_str(xml);
    let mut show = Show::default();
    let mut item: Option<Item> = None;
    let mut path: Vec<String> = Vec::new();
    let mut text = String::new();
    let mut seen_channel = false;
    loop {
        match reader.read_event()? {
            Event::Start(e) => {
                let name = e.name().as_ref().to_owned();
                if name == "channel" {
                    seen_channel = true;
                }
                if name == "item" && path.last().is_some_and(|p| p == "channel") {
                    item = Some(Item::default());
                }
                attributes(&e, &name, &mut show, item.as_mut())?;
                path.push(name);
                text.clear();
            }
            Event::Empty(e) => {
                let name = e.name().as_ref().to_owned();
                attributes(&e, &name, &mut show, item.as_mut())?;
            }
            Event::Text(t) => text.push_str(&t.xml10_content()),
            Event::CData(t) => text.push_str(&t.xml10_content()),
            Event::GeneralRef(r) => {
                if let Some(c) = r.resolve_char_ref()? {
                    text.push(c);
                } else {
                    text.push_str(match r.as_ref() {
                        "amp" => "&",
                        "lt" => "<",
                        "gt" => ">",
                        "quot" => "\"",
                        "apos" => "'",
                        _ => "",
                    });
                }
            }
            Event::End(_) => {
                let Some(name) = path.pop() else { continue };
                let value = text.trim();
                let parent = path.last().map(String::as_str);
                match (&mut item, parent) {
                    (Some(it), Some("item")) => element_of_item(it, &name, value),
                    (_, Some("channel")) if name == "item" => {
                        if let Some(it) = item.take().filter(|it| !it.audio_url.is_empty()) {
                            show.episodes.push(finish(it));
                        }
                    }
                    (None, Some("channel")) => element_of_show(&mut show, &name, value),
                    (None, Some("image")) if name == "url" && show.image_url.is_none() => {
                        show.image_url = some(value);
                    }
                    _ => {}
                }
                text.clear();
            }
            Event::Eof => break,
            _ => {}
        }
    }
    if !seen_channel {
        bail!("not an RSS feed");
    }
    Ok(show)
}

fn attributes(
    e: &quick_xml::events::BytesStart,
    name: &str,
    show: &mut Show,
    item: Option<&mut Item>,
) -> Result<()> {
    let get = |key: &str| -> Result<Option<String>> {
        Ok(e.try_get_attribute(key)?
            .map(|a| {
                a.normalized_value(quick_xml::XmlVersion::Implicit1_0)
                    .map(|v| v.trim().to_owned())
            })
            .transpose()?
            .filter(|v| !v.is_empty()))
    };
    match (name, item) {
        ("enclosure", Some(it)) => {
            if let Some(url) = get("url")? {
                it.audio_url = url;
                it.audio_size = get("length")?
                    .and_then(|v| v.parse().ok())
                    .filter(|n| *n > 0);
                it.audio_type = get("type")?;
            }
        }
        ("itunes:image", Some(it)) => it.image_url = get("href")?,
        ("podcast:chapters", Some(it)) => it.chapters_url = get("url")?,
        ("podcast:transcript", Some(it)) => {
            // VTT first (timed, like lyrics), else the first one listed.
            let vtt = get("type")?.is_some_and(|t| t.contains("vtt"));
            if it.transcript_url.is_none() || vtt {
                it.transcript_url = get("url")?;
            }
        }
        ("itunes:image", None) => {
            if let Some(href) = get("href")? {
                show.image_url = Some(href);
            }
        }
        _ => {}
    }
    Ok(())
}

fn element_of_show(show: &mut Show, name: &str, value: &str) {
    match name {
        "title" => show.title = plain(value),
        "itunes:author" => show.author = some(&plain(value)),
        "author" if show.author.is_none() => show.author = some(&plain(value)),
        "description" => show.description = some(value).map(clip),
        "itunes:summary" if show.description.is_none() => show.description = some(value).map(clip),
        "link" => show.link = some(value),
        "language" => show.language = some(value),
        _ => {}
    }
}

fn element_of_item(item: &mut Item, name: &str, value: &str) {
    match name {
        "title" => item.title = plain(value),
        "guid" => item.guid = value.to_owned(),
        "description" => item.description = some(value).map(clip),
        "itunes:summary" | "content:encoded" if item.description.is_none() => {
            item.description = some(value).map(clip);
        }
        "pubDate" => item.published_at = parse_date(value),
        "itunes:duration" => item.duration_s = parse_duration(value),
        _ => {}
    }
}

/// Titles and names are plain text, but many feeds escape them twice (`&amp;amp;` read as
/// `&amp;`): the usual entities are decoded once more.
fn plain(value: &str) -> String {
    if !value.contains('&') {
        return value.to_owned();
    }
    value
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#039;", "'")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
}

fn finish(mut item: Item) -> Item {
    if item.guid.is_empty() {
        item.guid = item.audio_url.clone();
    }
    item
}

fn some(value: &str) -> Option<String> {
    (!value.is_empty()).then(|| value.to_owned())
}

fn clip(mut text: String) -> String {
    if text.len() > DESCRIPTION_MAX {
        let mut end = DESCRIPTION_MAX;
        while !text.is_char_boundary(end) {
            end -= 1;
        }
        text.truncate(end);
        text.push('…');
    }
    text
}

/// `itunes:duration`: `3723`, `62:03` or `1:02:03`.
pub fn parse_duration(value: &str) -> Option<i64> {
    let mut total = 0i64;
    let parts: Vec<&str> = value.trim().split(':').collect();
    if parts.len() > 3 {
        return None;
    }
    for part in parts {
        let n: f64 = part.trim().parse().ok()?;
        total = total * 60 + n as i64;
    }
    (total > 0).then_some(total)
}

/// RFC 2822 dates of RSS (`Tue, 10 Jun 2003 04:00:00 GMT`, `+0200`…), as Unix seconds.
pub fn parse_date(value: &str) -> Option<i64> {
    let value = value.trim();
    let value = value.split_once(',').map_or(value, |(_, rest)| rest).trim();
    let mut parts = value.split_whitespace();
    let day: i64 = parts.next()?.parse().ok()?;
    let month = match parts.next()?.get(..3)?.to_ascii_lowercase().as_str() {
        "jan" => 1,
        "feb" => 2,
        "mar" => 3,
        "apr" => 4,
        "may" => 5,
        "jun" => 6,
        "jul" => 7,
        "aug" => 8,
        "sep" => 9,
        "oct" => 10,
        "nov" => 11,
        "dec" => 12,
        _ => return None,
    };
    let mut year: i64 = parts.next()?.parse().ok()?;
    if year < 100 {
        year += if year < 50 { 2000 } else { 1900 };
    }
    let mut hms = parts.next().unwrap_or("00:00:00").split(':');
    let h: i64 = hms.next()?.parse().ok()?;
    let m: i64 = hms.next().unwrap_or("0").parse().ok()?;
    let s: i64 = hms.next().unwrap_or("0").parse().ok()?;
    let offset = match parts.next().unwrap_or("GMT") {
        z if z.starts_with('+') || z.starts_with('-') => {
            let n: i64 = z[1..].parse().ok()?;
            let minutes = n / 100 * 60 + n % 100;
            if z.starts_with('-') {
                -minutes
            } else {
                minutes
            }
        }
        "EST" => -5 * 60,
        "EDT" => -4 * 60,
        "CST" => -6 * 60,
        "CDT" => -5 * 60,
        "MST" => -7 * 60,
        "MDT" => -6 * 60,
        "PST" => -8 * 60,
        "PDT" => -7 * 60,
        _ => 0,
    };
    Some(days_from_civil(year, month, day) * 86_400 + h * 3600 + m * 60 + s - offset * 60)
}

/// Days since 1970-01-01 (proleptic Gregorian calendar).
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

#[cfg(test)]
mod tests {
    use super::*;

    const FEED: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0">
<channel>
  <title><![CDATA[Rock &amp; Roll Stories]]></title>
  <link>https://example.org/show</link>
  <language>fr</language>
  <itunes:author>Radio Example</itunes:author>
  <description><![CDATA[<p>Histoires du rock</p>]]></description>
  <itunes:image href="https://example.org/cover.jpg"/>
  <image><url>https://example.org/small.jpg</url><title>ignored</title></image>
  <item>
    <title>Michael Jackson, l'enfance</title>
    <guid isPermaLink="false">ep-2</guid>
    <pubDate>Tue, 10 Jun 2003 04:00:00 GMT</pubDate>
    <itunes:duration>1:02:03</itunes:duration>
    <enclosure url="https://cdn.example.org/ep2.mp3" length="12345" type="audio/mpeg"/>
    <podcast:transcript url="https://example.org/ep2.srt" type="application/srt"/>
    <podcast:transcript url="https://example.org/ep2.vtt" type="text/vtt"/>
    <podcast:chapters url="https://example.org/ep2.json" type="application/json+chapters"/>
    <description>Notes &#233;pisode</description>
  </item>
  <item>
    <title>Bande-annonce</title>
    <pubDate>Mon, 09 Jun 2003 10:00:00 +0200</pubDate>
    <itunes:duration>95</itunes:duration>
    <enclosure url="https://cdn.example.org/trailer.mp3" type="audio/mpeg"/>
  </item>
  <item><title>Sans audio</title></item>
</channel>
</rss>"#;

    #[test]
    fn reads_a_show_and_its_playable_episodes() {
        let show = parse(FEED).unwrap();
        assert_eq!(show.title, "Rock & Roll Stories");
        assert_eq!(show.author.as_deref(), Some("Radio Example"));
        assert_eq!(
            show.description.as_deref(),
            Some("<p>Histoires du rock</p>")
        );
        assert_eq!(
            show.image_url.as_deref(),
            Some("https://example.org/cover.jpg"),
            "itunes:image wins"
        );
        assert_eq!(show.language.as_deref(), Some("fr"));
        assert_eq!(show.episodes.len(), 2, "the item without audio is skipped");
        let ep = &show.episodes[0];
        assert_eq!(ep.guid, "ep-2");
        assert_eq!(ep.title, "Michael Jackson, l'enfance");
        assert_eq!(ep.published_at, Some(1_055_217_600));
        assert_eq!(ep.duration_s, Some(3723));
        assert_eq!(ep.audio_size, Some(12345));
        assert_eq!(
            ep.transcript_url.as_deref(),
            Some("https://example.org/ep2.vtt"),
            "VTT preferred"
        );
        assert_eq!(
            ep.chapters_url.as_deref(),
            Some("https://example.org/ep2.json")
        );
        assert_eq!(ep.description.as_deref(), Some("Notes épisode"));
        let trailer = &show.episodes[1];
        assert_eq!(
            trailer.guid, "https://cdn.example.org/trailer.mp3",
            "no guid: its audio"
        );
        assert_eq!(
            trailer.published_at,
            Some(1_055_145_600),
            "+0200 taken into account"
        );
        assert_eq!(trailer.duration_s, Some(95));
    }

    #[test]
    fn refuses_what_is_not_a_feed() {
        assert!(parse("<html><body>Not found</body></html>").is_err());
    }

    #[test]
    fn durations_and_dates() {
        assert_eq!(parse_duration("62:03"), Some(3723));
        assert_eq!(parse_duration("abc"), None);
        assert_eq!(parse_date("10 Jun 2003 04:00:00 GMT"), Some(1_055_217_600));
        assert_eq!(parse_date("Thu, 01 Jan 1970 00:00:00 +0000"), Some(0));
        assert_eq!(parse_date("not a date"), None);
    }
}
