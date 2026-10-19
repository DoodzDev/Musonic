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
}

impl Default for Config {
    fn default() -> Self {
        Self {
            bind: ([127, 0, 0, 1], 4533).into(),
            data_dir: "data".into(),
            music_dir: None,
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
