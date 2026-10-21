//! The server's technical logs, for the console (tranche C7): the last lines written, kept in
//! memory only (2 000 lines, a few hundred kB). The full logs stay where they always were
//! (the terminal, `docker logs`).

use std::{
    collections::VecDeque,
    io::Write,
    sync::{LazyLock, Mutex},
};

use serde::Serialize;
use ts_rs::TS;

const KEEP: usize = 2000;

/// The last line's number, and the lines kept with theirs.
type Lines = (u64, VecDeque<(u64, String)>);

static LINES: LazyLock<Mutex<Lines>> =
    LazyLock::new(|| Mutex::new((0, VecDeque::with_capacity(KEEP))));

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct LogLine {
    #[ts(type = "number")]
    pub id: u64,
    /// `ERROR`, `WARN`, `INFO`, `DEBUG`, `TRACE`.
    pub level: String,
    pub text: String,
}

/// Where the logs are also written (one line per event).
#[derive(Clone, Copy, Default)]
pub struct Memory;

impl Write for Memory {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let text = String::from_utf8_lossy(buf);
        if let Ok(mut lines) = LINES.lock() {
            for line in text.lines().filter(|l| !l.trim().is_empty()) {
                lines.0 += 1;
                let id = lines.0;
                if lines.1.len() == KEEP {
                    lines.1.pop_front();
                }
                lines.1.push_back((id, line.to_owned()));
            }
        }
        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

impl<'a> tracing_subscriber::fmt::MakeWriter<'a> for Memory {
    type Writer = Memory;
    fn make_writer(&'a self) -> Self::Writer {
        *self
    }
}

fn level_of(line: &str) -> &'static str {
    ["ERROR", "WARN", "INFO", "DEBUG", "TRACE"]
        .into_iter()
        .find(|l| line.split_whitespace().take(3).any(|w| w == *l))
        .unwrap_or("INFO")
}

fn rank(level: &str) -> u8 {
    match level {
        "ERROR" => 0,
        "WARN" => 1,
        "INFO" => 2,
        "DEBUG" => 3,
        _ => 4,
    }
}

/// The last lines (oldest first), at `min` level or worse, after line `after`.
pub fn last(min: &str, after: u64, limit: usize) -> Vec<LogLine> {
    let Ok(lines) = LINES.lock() else {
        return Vec::new();
    };
    let max = rank(&min.to_ascii_uppercase());
    let mut out: Vec<LogLine> = lines
        .1
        .iter()
        .rev()
        .filter(|(id, _)| *id > after)
        .map(|(id, text)| (id, text, level_of(text)))
        .filter(|(_, _, level)| rank(level) <= max)
        .take(limit)
        .map(|(id, text, level)| LogLine {
            id: *id,
            level: level.to_owned(),
            text: text.clone(),
        })
        .collect();
    out.reverse();
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_the_last_lines_by_level() {
        let mut m = Memory;
        m.write_all(b"2026-10-21T10:00:00Z  INFO musonic_server: started\n")
            .unwrap();
        m.write_all(b"2026-10-21T10:00:01Z  WARN musonic_server: careful\n2026-10-21T10:00:02Z ERROR musonic_server: broken\n")
            .unwrap();
        let errors = last("error", 0, 10);
        assert_eq!(
            errors.last().unwrap().text,
            "2026-10-21T10:00:02Z ERROR musonic_server: broken"
        );
        let warn = last("warn", 0, 10);
        assert!(warn.iter().all(|l| l.level != "INFO"));
        let all = last("info", 0, 2);
        assert_eq!(all.len(), 2);
        assert!(all[0].id < all[1].id, "oldest first");
        assert!(last("info", all[1].id, 10).is_empty());
    }
}
