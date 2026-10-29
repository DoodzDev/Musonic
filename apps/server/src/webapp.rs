//! Musonic Web hosted by the server, at `/app` (tranche C7): the console installs or updates
//! it from the latest `web-v…` release on GitHub (its `Musonic-Web-app.zip`, built for `/app/`).
//! Files go to `<data>/web`; the server serves whatever is there.

use std::{
    io::Read,
    path::{Path, PathBuf},
    time::Duration,
};

use anyhow::{Context, Result, bail};
use serde::Serialize;
use ts_rs::TS;

/// The release file built to be served under `/app/`.
pub const ASSET: &str = "Musonic-Web-app.zip";
const VERSION_FILE: &str = ".musonic-web-version";
/// More would not be a web client.
const MAX_BYTES: u64 = 100 * 1000 * 1000;

#[derive(Debug, Default, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WebApp {
    /// Version installed on this server (`None` = not installed).
    pub installed: Option<String>,
    /// Latest release with a file for the server.
    pub latest: Option<String>,
    /// Address of that release.
    pub url: Option<String>,
}

pub fn dir(data_dir: &Path) -> PathBuf {
    data_dir.join("web")
}

pub fn installed(data_dir: &Path) -> Option<String> {
    let d = dir(data_dir);
    if !d.join("index.html").is_file() {
        return None;
    }
    Some(
        std::fs::read_to_string(d.join(VERSION_FILE))
            .map(|v| v.trim().to_owned())
            .unwrap_or_else(|_| "?".to_owned()),
    )
}

fn client() -> Result<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .user_agent(concat!("musonic-server/", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(120))
        .build()?)
}

/// The newest Musonic Web release that has a file for the server: (version, page, file).
async fn latest() -> Result<Option<(String, String, String)>> {
    let list: Vec<serde_json::Value> = client()?
        .get(crate::metrics::RELEASES_URL)
        .header("accept", "application/vnd.github+json")
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    Ok(list
        .iter()
        .filter(|r| r["draft"] != true && r["prerelease"] != true)
        .filter_map(|r| {
            let version = r["tag_name"].as_str()?.strip_prefix("web-v")?.to_owned();
            let file = r["assets"]
                .as_array()?
                .iter()
                .find(|a| a["name"] == ASSET)?["browser_download_url"]
                .as_str()?
                .to_owned();
            Some((
                version,
                r["html_url"].as_str().unwrap_or_default().to_owned(),
                file,
            ))
        })
        .max_by_key(|(v, ..)| crate::metrics::version_key(v)))
}

pub async fn status(data_dir: &Path) -> WebApp {
    let mut out = WebApp {
        installed: installed(data_dir),
        ..Default::default()
    };
    match latest().await {
        Ok(Some((v, url, _))) => {
            out.latest = Some(v);
            out.url = Some(url);
        }
        Ok(None) => {}
        Err(e) => tracing::debug!("musonic web release: {e:#}"),
    }
    out
}

/// Downloads the latest release and puts it in place. Returns the version installed.
pub async fn install(data_dir: &Path) -> Result<String> {
    let Some((version, _, file)) = latest().await? else {
        bail!("no Musonic Web release has {ASSET} yet");
    };
    let bytes = client()?
        .get(&file)
        .send()
        .await?
        .error_for_status()?
        .bytes()
        .await?;
    if bytes.len() as u64 > MAX_BYTES {
        bail!("{ASSET} is too big");
    }
    let data_dir = data_dir.to_owned();
    let v = version.clone();
    tokio::task::spawn_blocking(move || unpack(&bytes, &data_dir, &v)).await??;
    Ok(version)
}

/// Unpacks next to the current version, then swaps the two folders.
fn unpack(zip: &[u8], data_dir: &Path, version: &str) -> Result<()> {
    let target = dir(data_dir);
    let fresh = data_dir.join("web.new");
    let old = data_dir.join("web.old");
    let _ = std::fs::remove_dir_all(&fresh);
    std::fs::create_dir_all(&fresh)?;
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(zip)).context("reading the zip")?;
    let mut total = 0u64;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        // Paths inside the folder only (no `..`, no absolute path).
        let Some(rel) = entry.enclosed_name() else {
            bail!(
                "unsafe path in {ASSET}: {}",
                entry.name().unwrap_or_default()
            );
        };
        let path = fresh.join(rel);
        if entry.is_dir() {
            std::fs::create_dir_all(&path)?;
            continue;
        }
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut buf = Vec::new();
        entry.by_ref().take(MAX_BYTES + 1).read_to_end(&mut buf)?;
        total += buf.len() as u64;
        if total > MAX_BYTES {
            bail!("{ASSET} unpacks too big");
        }
        std::fs::write(&path, buf)?;
    }
    if !fresh.join("index.html").is_file() {
        bail!("{ASSET} has no index.html");
    }
    std::fs::write(fresh.join(VERSION_FILE), version)?;
    let _ = std::fs::remove_dir_all(&old);
    if target.exists() {
        std::fs::rename(&target, &old)?;
    }
    std::fs::rename(&fresh, &target)?;
    let _ = std::fs::remove_dir_all(&old);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn zip_of(files: &[(&str, &str)]) -> Vec<u8> {
        let mut out = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        for (name, text) in files {
            out.start_file(*name, zip::write::SimpleFileOptions::default())
                .unwrap();
            out.write_all(text.as_bytes()).unwrap();
        }
        out.finish().unwrap().into_inner()
    }

    #[test]
    fn installs_and_replaces_a_version() {
        let data = crate::testing::temp_dir("webapp");
        assert_eq!(installed(&data), None);
        unpack(
            &zip_of(&[("index.html", "v1"), ("assets/a.js", "1")]),
            &data,
            "1.0.0",
        )
        .unwrap();
        assert_eq!(installed(&data).as_deref(), Some("1.0.0"));
        unpack(&zip_of(&[("index.html", "v2")]), &data, "1.1.0").unwrap();
        assert_eq!(installed(&data).as_deref(), Some("1.1.0"));
        assert!(!dir(&data).join("assets/a.js").exists(), "old files go");
        assert!(unpack(&zip_of(&[("../evil", "x")]), &data, "6").is_err());
        assert!(unpack(&zip_of(&[("readme.txt", "x")]), &data, "7").is_err());
        assert_eq!(
            installed(&data).as_deref(),
            Some("1.1.0"),
            "a bad file changes nothing"
        );
    }
}
