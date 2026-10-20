//! Live measures of the server for the administration console: CPU and memory of the process,
//! network rates, disk space, the size of the data folders, and the latest released versions.
//!
//! Sampled in the background (rates every 2 s, folder sizes every minute, releases every 6 h),
//! so reading them costs nothing. Linux measures; elsewhere they read as zero.

use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use serde::Serialize;
use ts_rs::TS;

const FAST: Duration = Duration::from_secs(2);
const SLOW: Duration = Duration::from_secs(60);
const RELEASES: Duration = Duration::from_secs(6 * 3600);
/// Where releases are published (tags `server-v*`, `web-v*`).
pub const RELEASES_URL: &str =
    "https://api.github.com/repos/DoodzProg/Musonic/releases?per_page=50";

#[derive(Debug, Clone, Default, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Live {
    /// Of one core (can exceed 100 with several).
    pub cpu_percent: f32,
    #[ts(type = "number")]
    pub memory_bytes: u64,
    #[ts(type = "number")]
    pub rx_bytes_per_sec: u64,
    #[ts(type = "number")]
    pub tx_bytes_per_sec: u64,
    #[ts(type = "number")]
    pub uptime_secs: u64,
}

#[derive(Debug, Clone, Default, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Folders {
    #[ts(type = "number")]
    pub database_bytes: u64,
    pub backups: u32,
    #[ts(type = "number")]
    pub backups_bytes: u64,
    /// Newest backup, Unix seconds.
    #[ts(type = "number | null")]
    pub last_backup_at: Option<i64>,
    #[ts(type = "number")]
    pub cache_bytes: u64,
}

#[derive(Debug, Clone, Default, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Release {
    pub version: String,
    pub url: String,
}

#[derive(Debug, Clone, Default, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Releases {
    pub server: Option<Release>,
    pub web: Option<Release>,
    /// When GitHub was last asked, Unix seconds.
    #[ts(type = "number | null")]
    pub checked_at: Option<i64>,
}

#[derive(Default)]
struct State {
    live: Live,
    folders: Folders,
    releases: Releases,
    /// (when, CPU ticks of the process, bytes received, bytes sent).
    last: Option<(Instant, u64, u64, u64)>,
}

pub struct Metrics {
    started: Instant,
    state: Mutex<State>,
}

impl Metrics {
    /// Starts sampling. `data_dir` holds the database, backups and caches.
    pub fn start(data_dir: PathBuf, check_releases: bool) -> Arc<Self> {
        let this = Arc::new(Self {
            started: Instant::now(),
            state: Mutex::new(State::default()),
        });
        let fast = this.clone();
        tokio::spawn(async move {
            let mut every = tokio::time::interval(FAST);
            loop {
                every.tick().await;
                fast.sample();
            }
        });
        let slow = this.clone();
        tokio::spawn(async move {
            let mut every = tokio::time::interval(SLOW);
            loop {
                every.tick().await;
                let dir = data_dir.clone();
                if let Ok(folders) = tokio::task::spawn_blocking(move || folders(&dir)).await
                    && let Ok(mut s) = slow.state.lock()
                {
                    s.folders = folders;
                }
            }
        });
        if check_releases {
            let rel = this.clone();
            tokio::spawn(async move {
                let mut every = tokio::time::interval(RELEASES);
                loop {
                    every.tick().await;
                    match latest_releases().await {
                        Ok(r) => {
                            if let Ok(mut s) = rel.state.lock() {
                                s.releases = r;
                            }
                        }
                        Err(e) => tracing::debug!("release check: {e:#}"),
                    }
                }
            });
        }
        this
    }

    fn sample(&self) {
        let now = Instant::now();
        let ticks = cpu_ticks();
        let (rx, tx) = network();
        let Ok(mut s) = self.state.lock() else {
            return;
        };
        if let Some((at, t0, rx0, tx0)) = s.last {
            let secs = now.duration_since(at).as_secs_f64().max(0.001);
            let per_sec = |a: u64, b: u64| (a.saturating_sub(b) as f64 / secs) as u64;
            s.live.cpu_percent =
                (ticks.saturating_sub(t0) as f64 / clock_ticks() / secs * 100.0) as f32;
            s.live.rx_bytes_per_sec = per_sec(rx, rx0);
            s.live.tx_bytes_per_sec = per_sec(tx, tx0);
        }
        s.live.memory_bytes = memory();
        s.last = Some((now, ticks, rx, tx));
    }

    pub fn live(&self) -> Live {
        let mut live = self
            .state
            .lock()
            .map(|s| s.live.clone())
            .unwrap_or_default();
        live.uptime_secs = self.started.elapsed().as_secs();
        live
    }

    pub fn folders(&self) -> Folders {
        self.state
            .lock()
            .map(|s| s.folders.clone())
            .unwrap_or_default()
    }

    pub fn releases(&self) -> Releases {
        self.state
            .lock()
            .map(|s| s.releases.clone())
            .unwrap_or_default()
    }
}

/// Total and free bytes of the disk holding `path`.
pub fn disk(path: &Path) -> Option<(u64, u64)> {
    #[cfg(target_os = "linux")]
    {
        use std::os::unix::ffi::OsStrExt;
        let c = std::ffi::CString::new(path.as_os_str().as_bytes()).ok()?;
        let mut st: libc::statvfs = unsafe { std::mem::zeroed() };
        // SAFETY: `c` is a valid C string and `st` a writable statvfs.
        if unsafe { libc::statvfs(c.as_ptr(), &mut st) } != 0 {
            return None;
        }
        let block = st.f_frsize as u64;
        Some((st.f_blocks as u64 * block, st.f_bavail as u64 * block))
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = path;
        None
    }
}

fn clock_ticks() -> f64 {
    #[cfg(target_os = "linux")]
    {
        // SAFETY: sysconf has no preconditions.
        let t = unsafe { libc::sysconf(libc::_SC_CLK_TCK) };
        if t > 0 {
            return t as f64;
        }
    }
    100.0
}

/// User + system CPU time of this process, in clock ticks.
fn cpu_ticks() -> u64 {
    let Ok(stat) = std::fs::read_to_string("/proc/self/stat") else {
        return 0;
    };
    // Fields after the command name (which may hold spaces, inside parentheses).
    let after = stat.rsplit_once(')').map_or("", |(_, r)| r);
    let fields: Vec<&str> = after.split_whitespace().collect();
    let get = |i: usize| {
        fields
            .get(i)
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(0)
    };
    // utime and stime are fields 14 and 15 of the whole line, 11 and 12 here.
    get(11) + get(12)
}

/// Resident memory of this process.
fn memory() -> u64 {
    std::fs::read_to_string("/proc/self/status")
        .ok()
        .and_then(|s| {
            s.lines()
                .find(|l| l.starts_with("VmRSS:"))
                .and_then(|l| l.split_whitespace().nth(1))
                .and_then(|kb| kb.parse::<u64>().ok())
        })
        .map_or(0, |kb| kb * 1024)
}

/// Bytes received and sent by every network interface but loopback.
fn network() -> (u64, u64) {
    let Ok(dev) = std::fs::read_to_string("/proc/net/dev") else {
        return (0, 0);
    };
    dev.lines()
        .skip(2)
        .filter_map(|l| l.split_once(':'))
        .filter(|(name, _)| name.trim() != "lo")
        .fold((0, 0), |(rx, tx), (_, rest)| {
            let f: Vec<u64> = rest
                .split_whitespace()
                .filter_map(|v| v.parse().ok())
                .collect();
            (
                rx + f.first().copied().unwrap_or(0),
                tx + f.get(8).copied().unwrap_or(0),
            )
        })
}

fn dir_size(dir: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return 0;
    };
    entries
        .filter_map(Result::ok)
        .map(|e| match e.file_type() {
            Ok(t) if t.is_dir() => dir_size(&e.path()),
            Ok(_) => e.metadata().map(|m| m.len()).unwrap_or(0),
            Err(_) => 0,
        })
        .sum()
}

fn folders(data: &Path) -> Folders {
    let file = |name: &str| {
        std::fs::metadata(data.join(name))
            .map(|m| m.len())
            .unwrap_or(0)
    };
    let mut out = Folders {
        database_bytes: file("musonic.db") + file("musonic.db-wal"),
        cache_bytes: dir_size(&data.join("cache")) + dir_size(&data.join("tmp")),
        ..Default::default()
    };
    if let Ok(entries) = std::fs::read_dir(data.join("backups")) {
        for e in entries.filter_map(Result::ok) {
            let Ok(m) = e.metadata() else { continue };
            if !e.file_name().to_string_lossy().ends_with(".db") {
                continue;
            }
            out.backups += 1;
            out.backups_bytes += m.len();
            let at = m
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64);
            out.last_backup_at = out.last_backup_at.max(at);
        }
    }
    out
}

/// `1.2.10` > `1.2.9`.
fn version_key(v: &str) -> Vec<u64> {
    v.split(['.', '-'])
        .map(|p| p.parse().unwrap_or(0))
        .collect()
}

/// Newest `prefix…` release of a list (`server-v`, `web-v`), drafts and pre-releases left out.
fn newest(releases: &[serde_json::Value], prefix: &str) -> Option<Release> {
    releases
        .iter()
        .filter(|r| r["draft"] != true && r["prerelease"] != true)
        .filter_map(|r| {
            let tag = r["tag_name"].as_str()?;
            let version = tag.strip_prefix(prefix)?;
            Some(Release {
                version: version.to_owned(),
                url: r["html_url"].as_str().unwrap_or_default().to_owned(),
            })
        })
        .max_by_key(|r| version_key(&r.version))
}

async fn latest_releases() -> anyhow::Result<Releases> {
    let list: Vec<serde_json::Value> = reqwest::Client::new()
        .get(RELEASES_URL)
        .header(
            "user-agent",
            concat!("musonic-server/", env!("CARGO_PKG_VERSION")),
        )
        .header("accept", "application/vnd.github+json")
        .timeout(Duration::from_secs(15))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    Ok(Releases {
        server: newest(&list, "server-v"),
        web: newest(&list, "web-v"),
        checked_at: Some(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs() as i64)
                .unwrap_or_default(),
        ),
    })
}

/// Whether `latest` is newer than `current`.
pub fn is_newer(latest: &str, current: &str) -> bool {
    version_key(latest) > version_key(current)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn picks_the_newest_release_of_each_app() {
        let list = vec![
            json!({ "tag_name": "web-v1.0.1", "html_url": "u1" }),
            json!({ "tag_name": "server-v0.9.0", "html_url": "u2" }),
            json!({ "tag_name": "web-v1.0.10", "html_url": "u3" }),
            json!({ "tag_name": "web-v2.0.0", "html_url": "u4", "prerelease": true }),
            json!({ "tag_name": "mobile-v2.0.1", "html_url": "u5" }),
        ];
        assert_eq!(newest(&list, "web-v").unwrap().version, "1.0.10");
        assert_eq!(newest(&list, "server-v").unwrap().url, "u2");
        assert!(is_newer("0.10.0", "0.9.9"));
        assert!(!is_newer("0.1.0", "0.1.0"));
    }

    #[test]
    fn reads_the_process_and_the_disk() {
        assert!(memory() > 0);
        let (total, free) = disk(Path::new("/")).unwrap();
        assert!(total > 0 && free <= total);
    }
}
