//! Episode transcripts (`podcast:transcript`, WebVTT or SRT) shown like synced lyrics: one line
//! per cue, from its start.

/// `(start in ms, text)` of each cue; speaker tags (`<v Name>`) and other markup removed.
pub fn parse(text: &str) -> Vec<(i64, String)> {
    let mut out: Vec<(i64, String)> = Vec::new();
    let mut lines = text.lines().map(str::trim).peekable();
    while let Some(line) = lines.next() {
        let Some((start, _)) = line.split_once("-->") else {
            continue;
        };
        let Some(ms) = timestamp(start.trim()) else {
            continue;
        };
        let mut cue = Vec::new();
        while let Some(next) = lines.peek() {
            if next.is_empty() {
                break;
            }
            cue.push(strip_tags(next));
            lines.next();
        }
        let text = cue
            .join(" ")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        if text.is_empty() {
            continue;
        }
        // Cues of a few words: joined to the previous one while it is short.
        match out.last_mut() {
            Some((_, prev)) if prev.len() + text.len() < JOIN_BELOW => {
                prev.push(' ');
                prev.push_str(&text);
            }
            _ => out.push((ms, text)),
        }
    }
    out
}

/// Cues shorter than this are joined: one line per word would change too fast to read.
const JOIN_BELOW: usize = 40;

/// `01:02:03.456`, `02:03.456` (VTT) or `01:02:03,456` (SRT), in ms.
fn timestamp(value: &str) -> Option<i64> {
    let value = value.split_whitespace().next()?.replace(',', ".");
    let (hms, frac) = value.split_once('.').unwrap_or((&value, "0"));
    let mut total = 0i64;
    for part in hms.split(':') {
        total = total * 60 + part.parse::<i64>().ok()?;
    }
    let frac: String = frac.chars().take(3).collect();
    let ms = format!("{frac:0<3}").parse::<i64>().ok()?;
    Some(total * 1000 + ms)
}

fn strip_tags(line: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut inside = false;
    for c in line.chars() {
        match c {
            '<' => inside = true,
            '>' => inside = false,
            _ if !inside => out.push(c),
            _ => {}
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vtt_and_srt_become_timed_lines() {
        let vtt = "WEBVTT\n\n00:00:01.500 --> 00:00:04.000\n<v Anna>Bonjour à tous, bienvenue dans l'émission\n\n00:04.000 --> 00:00:06.000\nAujourd'hui on parle\nde Michael Jackson.\n";
        assert_eq!(
            parse(vtt),
            vec![
                (1500, "Bonjour à tous, bienvenue dans l'émission".to_owned()),
                (4000, "Aujourd'hui on parle de Michael Jackson.".to_owned()),
            ]
        );
        let srt =
            "1\n00:00:01,000 --> 00:00:02,000\nOui\n\n2\n00:00:02,000 --> 00:00:03,000\nbien sûr\n";
        assert_eq!(
            parse(srt),
            vec![(1000, "Oui bien sûr".to_owned())],
            "short cues joined"
        );
        assert!(parse("not a transcript").is_empty());
    }
}
