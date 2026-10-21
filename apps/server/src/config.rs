//! Server configuration: an optional TOML file (`MUSONIC_CONFIG`) overridden by environment
//! variables. Secrets never go in the file.

use std::{net::SocketAddr, path::PathBuf};

use anyhow::{Context, Result};
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct Config {
    /// Address and port to listen on.
    pub bind: SocketAddr,
    /// Database, caches and temporary files.
    pub data_dir: PathBuf,
    /// Root of the music library. Without it the server starts with an empty library.
    pub music_dir: Option<PathBuf>,
    /// Minutes between scheduled scans (0 = none; changes are picked up as they happen anyway).
    pub scan_interval_minutes: u64,
    /// Accept the Subsonic token auth (`t` + `s`) used by many clients. It needs the password
    /// kept encrypted next to its hash; off = only password, API key and session sign-ins.
    pub legacy_auth: bool,
    /// Online catalog (Deezer's public API): search results, albums and artists beyond the
    /// library, liked or added to playlists right away.
    pub online: bool,
    /// Base URL of that API (tests point it elsewhere).
    pub deezer_api_url: String,
    /// Play the 30-second preview of an online track no provider has.
    pub online_previews: bool,
    /// Another Subsonic server to relay audio from (an OctoFiesta, a Navidrome…). Its password
    /// comes from `MUSONIC_SUBSONIC_PROVIDER_PASSWORD` only.
    pub subsonic_provider_url: Option<String>,
    pub subsonic_provider_user: Option<String>,
    /// Import online tracks into the library when liked or added to a playlist.
    pub import: bool,
    /// Folder of the imports, inside the music folder.
    pub import_dir: String,
    /// Quality of imported files: `mp3_128`, `mp3_320` or `flac` (the best a provider has, up
    /// to it).
    pub import_quality: String,
    /// Daily database backups kept in `<data_dir>/backups` (0 = none).
    pub backup_days: u64,
    /// The built administration console. Default: `admin` next to the binary, else
    /// `/usr/share/musonic/admin`.
    pub admin_dir: Option<PathBuf>,
    /// Look on GitHub for newer releases of the server and of Musonic Web (every 6 hours).
    pub update_check: bool,
    /// Highest streaming bit rate for every account, kbit/s (0 = no limit); an account's own
    /// limit wins when lower.
    pub max_bit_rate: u32,
    /// Format of the streams made smaller when a client asks no format: `mp3`, `opus`, `aac`.
    pub transcode_format: String,
    /// The machine's `/proc/net/dev` when the server runs in a container (mount it read-only
    /// there), to count the traffic of the whole machine and not only the server's.
    pub host_net_dev: Option<PathBuf>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            bind: ([127, 0, 0, 1], 4533).into(),
            data_dir: "data".into(),
            music_dir: None,
            scan_interval_minutes: 60,
            legacy_auth: true,
            online: true,
            deezer_api_url: crate::online::deezer::DEFAULT_URL.to_owned(),
            online_previews: true,
            subsonic_provider_url: None,
            subsonic_provider_user: None,
            import: true,
            import_dir: "Musonic".to_owned(),
            import_quality: "mp3_320".to_owned(),
            backup_days: 14,
            admin_dir: None,
            update_check: true,
            max_bit_rate: 0,
            transcode_format: "mp3".to_owned(),
            host_net_dev: Some("/host/net/dev".into()),
        }
    }
}

fn env(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|v| v.trim().to_owned())
        .filter(|v| !v.is_empty())
}

impl Config {
    pub fn load() -> Result<Self> {
        let mut cfg = match env("MUSONIC_CONFIG") {
            Some(path) => {
                let text =
                    std::fs::read_to_string(&path).with_context(|| format!("reading {path}"))?;
                toml::from_str(&text).with_context(|| format!("parsing {path}"))?
            }
            None => Config::default(),
        };
        if let Some(v) = env("MUSONIC_BIND") {
            cfg.bind = v.parse().context("MUSONIC_BIND")?;
        }
        if let Some(v) = env("MUSONIC_DATA_DIR") {
            cfg.data_dir = v.into();
        }
        if let Some(v) = env("MUSONIC_MUSIC_DIR") {
            cfg.music_dir = Some(v.into());
        }
        if let Some(v) = env("MUSONIC_LEGACY_AUTH") {
            cfg.legacy_auth =
                matches!(v.to_ascii_lowercase().as_str(), "1" | "true" | "yes" | "on");
        }
        if let Some(v) = env("MUSONIC_ONLINE") {
            cfg.online = matches!(v.to_ascii_lowercase().as_str(), "1" | "true" | "yes" | "on");
        }
        if let Some(v) = env("MUSONIC_DEEZER_API_URL") {
            cfg.deezer_api_url = v;
        }
        if let Some(v) = env("MUSONIC_ONLINE_PREVIEWS") {
            cfg.online_previews =
                matches!(v.to_ascii_lowercase().as_str(), "1" | "true" | "yes" | "on");
        }
        if let Some(v) = env("MUSONIC_IMPORT") {
            cfg.import = matches!(v.to_ascii_lowercase().as_str(), "1" | "true" | "yes" | "on");
        }
        if let Some(v) = env("MUSONIC_IMPORT_DIR") {
            cfg.import_dir = v;
        }
        if let Some(v) = env("MUSONIC_IMPORT_QUALITY") {
            cfg.import_quality = v;
        }
        if let Some(v) = env("MUSONIC_UPDATE_CHECK") {
            cfg.update_check =
                matches!(v.to_ascii_lowercase().as_str(), "1" | "true" | "yes" | "on");
        }
        if let Some(v) = env("MUSONIC_HOST_NET_DEV") {
            cfg.host_net_dev = Some(v.into());
        }
        if let Some(v) = env("MUSONIC_ADMIN_DIR") {
            cfg.admin_dir = Some(v.into());
        }
        if let Some(v) = env("MUSONIC_BACKUP_DAYS") {
            cfg.backup_days = v.parse().context("MUSONIC_BACKUP_DAYS")?;
        }
        if let Some(v) = env("MUSONIC_SUBSONIC_PROVIDER_URL") {
            cfg.subsonic_provider_url = Some(v);
        }
        if let Some(v) = env("MUSONIC_SUBSONIC_PROVIDER_USER") {
            cfg.subsonic_provider_user = Some(v);
        }
        if let Some(v) = env("MUSONIC_MAX_BIT_RATE") {
            cfg.max_bit_rate = v.parse().context("MUSONIC_MAX_BIT_RATE")?;
        }
        if let Some(v) = env("MUSONIC_TRANSCODE_FORMAT") {
            cfg.transcode_format = v.to_ascii_lowercase();
        }
        if let Some(v) = env("MUSONIC_SCAN_INTERVAL_MINUTES") {
            cfg.scan_interval_minutes = v.parse().context("MUSONIC_SCAN_INTERVAL_MINUTES")?;
        }
        Ok(cfg)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_toml_with_defaults() {
        let cfg: Config = toml::from_str("music_dir = \"/music\"").unwrap();
        assert_eq!(
            cfg.music_dir.as_deref(),
            Some(std::path::Path::new("/music"))
        );
        assert_eq!(cfg.bind.port(), 4533);
    }
}
