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

use crate::db::Db;

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
    /// The whole machine, when its counters are visible (see `host_net_dev`).
    pub host_visible: bool,
    #[ts(type = "number")]
    pub host_rx_bytes_per_sec: u64,
    #[ts(type = "number")]
    pub host_tx_bytes_per_sec: u64,
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

/// Measures of the hour in progress, written to `metric_hour` every minute.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct Bucket {
    pub hour: i64,
    pub host_rx: u64,
    pub host_tx: u64,
    pub app_rx: u64,
    pub app_tx: u64,
    pub cpu_sum: f64,
    pub samples: u64,
    pub memory_max: u64,
}

#[derive(Default)]
struct State {
    live: Live,
    folders: Folders,
    releases: Releases,
    /// (when, CPU ticks of the process, bytes received, bytes sent).
    last: Option<(Instant, u64, u64, u64)>,
    host_last: Option<(u64, u64)>,
    bucket: Bucket,
    /// Finished hours not written yet.
    done: Vec<Bucket>,
}

/// Where and what to measure.
pub struct Options {
    pub db: Option<Db>,
    pub data_dir: PathBuf,
    pub music_dir: Option<PathBuf>,
    pub check_releases: bool,
    /// The machine's `/proc/net/dev`, made visible to a container (read-only mount).
    pub host_net_dev: Option<PathBuf>,
}

pub struct Metrics {
    started: Instant,
    state: Mutex<State>,
    host_net_dev: Option<PathBuf>,
}

/// Bytes since the last reading, a counter reset (reboot, restart) counting from zero.
fn delta(now: u64, before: u64) -> u64 {
    if now >= before { now - before } else { now }
}

fn hour_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64 / 3600)
        .unwrap_or_default()
}

impl Metrics {
    /// Starts sampling (and, with a database, keeping hourly measures).
    pub fn start(opts: Options) -> Arc<Self> {
        let host_net_dev = opts.host_net_dev.clone().filter(|p| p.is_file());
        if let Some(p) = &host_net_dev {
            tracing::info!("machine traffic read from {}", p.display());
        }
        let this = Arc::new(Self {
            started: Instant::now(),
            state: Mutex::new(State::default()),
            host_net_dev,
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
        let (data_dir, music_dir, db) = (opts.data_dir, opts.music_dir, opts.db);
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
                if let Some(db) = &db {
                    let disk = disk(music_dir.as_deref().unwrap_or(&data_dir));
                    if let Err(e) = slow.flush(db, disk.map(|(t, f)| t - f)).await {
                        tracing::warn!("keeping measures: {e:#}");
                    }
                }
            }
        });
        if opts.check_releases {
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
        let (rx, tx) = network(Path::new("/proc/net/dev"), false);
        let host = self.host_net_dev.as_deref().map(|p| network(p, true));
        let hour = hour_now();
        let Ok(mut s) = self.state.lock() else {
            return;
        };
        if s.bucket.hour != hour {
            let finished = std::mem::replace(
                &mut s.bucket,
                Bucket {
                    hour,
                    ..Default::default()
                },
            );
            if finished.hour != 0 && finished.samples > 0 {
                s.done.push(finished);
            }
        }
        s.live.memory_bytes = memory();
        s.bucket.memory_max = s.bucket.memory_max.max(s.live.memory_bytes);
        if let Some((at, t0, rx0, tx0)) = s.last {
            let secs = now.duration_since(at).as_secs_f64().max(0.001);
            let (drx, dtx) = (delta(rx, rx0), delta(tx, tx0));
            s.live.cpu_percent = (delta(ticks, t0) as f64 / clock_ticks() / secs * 100.0) as f32;
            s.live.rx_bytes_per_sec = (drx as f64 / secs) as u64;
            s.live.tx_bytes_per_sec = (dtx as f64 / secs) as u64;
            s.bucket.app_rx += drx;
            s.bucket.app_tx += dtx;
            s.bucket.cpu_sum += f64::from(s.live.cpu_percent);
            s.bucket.samples += 1;
            if let (Some((hrx, htx)), Some((hrx0, htx0))) = (host, s.host_last) {
                let (dhrx, dhtx) = (delta(hrx, hrx0), delta(htx, htx0));
                s.live.host_rx_bytes_per_sec = (dhrx as f64 / secs) as u64;
                s.live.host_tx_bytes_per_sec = (dhtx as f64 / secs) as u64;
                s.bucket.host_rx += dhrx;
                s.bucket.host_tx += dhtx;
            }
        }
        s.live.host_visible = host.is_some();
        s.host_last = host;
        s.last = Some((now, ticks, rx, tx));
    }

    /// Writes the measures gathered since the last time (added to their hour's row).
    async fn flush(&self, db: &Db, disk_used: Option<u64>) -> anyhow::Result<()> {
        let buckets: Vec<Bucket> = {
            let Ok(mut s) = self.state.lock() else {
                return Ok(());
            };
            let mut out = std::mem::take(&mut s.done);
            let (hour, memory_max) = (s.bucket.hour, s.live.memory_bytes);
            let current = std::mem::replace(
                &mut s.bucket,
                Bucket {
                    hour,
                    memory_max,
                    ..Default::default()
                },
            );
            if current.hour != 0 && current.samples > 0 {
                out.push(current);
            }
            out
        };
        if buckets.is_empty() {
            return Ok(());
        }
        db.call(move |c| {
            let tx = c.transaction()?;
            for b in &buckets {
                tx.execute(
                    "INSERT INTO metric_hour(hour, host_rx, host_tx, app_rx, app_tx, cpu_sum, samples,
                         memory_max, disk_used, music_bytes)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9,
                         (SELECT sum(size) FROM track_file WHERE missing = 0))
                     ON CONFLICT(hour) DO UPDATE SET host_rx = host_rx + excluded.host_rx,
                         host_tx = host_tx + excluded.host_tx, app_rx = app_rx + excluded.app_rx,
                         app_tx = app_tx + excluded.app_tx, cpu_sum = cpu_sum + excluded.cpu_sum,
                         samples = samples + excluded.samples,
                         memory_max = max(memory_max, excluded.memory_max),
                         disk_used = coalesce(excluded.disk_used, disk_used),
                         music_bytes = coalesce(excluded.music_bytes, music_bytes)",
                    rusqlite::params![
                        b.hour,
                        b.host_rx as i64,
                        b.host_tx as i64,
                        b.app_rx as i64,
                        b.app_tx as i64,
                        b.cpu_sum,
                        b.samples as i64,
                        b.memory_max as i64,
                        disk_used.map(|d| d as i64)
                    ],
                )?;
            }
            tx.commit()?;
            Ok(())
        })
        .await
    }

    /// Measures not written to the database yet (the last minute, at most).
    pub fn pending(&self) -> Vec<Bucket> {
        self.state
            .lock()
            .map(|s| {
                let mut out = s.done.clone();
                if s.bucket.samples > 0 {
                    out.push(s.bucket.clone());
                }
                out
            })
            .unwrap_or_default()
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

/// Bytes received and sent by the interfaces of a `/proc/net/dev`: all but loopback, and for
/// the machine (`host`) only its real network cards, not the virtual ones of containers.
fn network(path: &Path, host: bool) -> (u64, u64) {
    let Ok(dev) = std::fs::read_to_string(path) else {
        return (0, 0);
    };
    parse_net_dev(&dev, host)
}

fn parse_net_dev(dev: &str, host: bool) -> (u64, u64) {
    const VIRTUAL: &[&str] = &[
        "lo",
        "docker",
        "br-",
        "veth",
        "virbr",
        "cni",
        "flannel",
        "vxlan",
        "tailscale",
        "pterodactyl",
    ];
    dev.lines()
        .skip(2)
        .filter_map(|l| l.split_once(':'))
        .filter(|(name, _)| {
            let name = name.trim();
            if host {
                !VIRTUAL.iter().any(|v| name.starts_with(v))
            } else {
                name != "lo"
            }
        })
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
    fn counts_real_cards_for_the_machine() {
        let dev = "Inter-|...\n face |...\n    lo: 100 0 0 0 0 0 0 0 100 0 0 0 0 0 0 0\n  ens3: 5000 0 0 0 0 0 0 0 9000 0 0 0 0 0 0 0\npterodactyl0: 6 0 0 0 0 0 0 0 6 0 0 0 0 0 0 0\ndocker0: 70 0 0 0 0 0 0 0 80 0 0 0 0 0 0 0\nveth1a: 3 0 0 0 0 0 0 0 4 0 0 0 0 0 0 0\n";
        assert_eq!(parse_net_dev(dev, true), (5000, 9000));
        assert_eq!(parse_net_dev(dev, false), (5079, 9090));
        assert_eq!(delta(150, 100), 50);
        assert_eq!(delta(20, 100), 20, "a counter reset counts from zero");
    }

    #[test]
    fn reads_the_process_and_the_disk() {
        assert!(memory() > 0);
        let (total, free) = disk(Path::new("/")).unwrap();
        assert!(total > 0 && free <= total);
    }
}
