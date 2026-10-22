//! Server settings changed from the console (tranche C7): kept in the database (`property`,
//! keys `setting.<name>`), applied over the configuration (file, environment) when the server
//! starts. Changing one asks for a restart, which the console offers.
//!
//! Only settings that are safe to change from a web page are here: addresses, folders and
//! secrets stay in the configuration.

use std::collections::BTreeMap;

use anyhow::{Result, bail};
use rusqlite::Connection;
use serde::Serialize;
use serde_json::{Value, json};
use ts_rs::TS;

use crate::config::Config;

enum Kind {
    Bool,
    /// Whole number between these.
    Int(i64, i64),
    Choice(&'static [&'static str]),
}

/// Every setting the console can change.
const SETTINGS: &[(&str, Kind)] = &[
    ("import", Kind::Bool),
    (
        "import_quality",
        Kind::Choice(&["mp3_128", "mp3_320", "flac"]),
    ),
    ("online", Kind::Bool),
    ("online_previews", Kind::Bool),
    ("scan_interval_minutes", Kind::Int(0, 7 * 24 * 60)),
    ("backup_days", Kind::Int(0, 365)),
    ("transcode_cache_mb", Kind::Int(0, 100_000)),
    ("legacy_auth", Kind::Bool),
    ("update_check", Kind::Bool),
    ("max_bit_rate", Kind::Int(0, 320)),
    ("transcode_format", Kind::Choice(&["mp3", "opus", "aac"])),
];

/// A setting as the console shows it.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SettingValue {
    pub key: String,
    /// What it will be at the next start.
    #[ts(type = "boolean | number | string")]
    pub value: Value,
    /// What the server runs with now.
    #[ts(type = "boolean | number | string")]
    pub current: Value,
    /// For a choice, its possible values.
    pub choices: Option<Vec<String>>,
    #[ts(type = "number | null")]
    pub min: Option<i64>,
    #[ts(type = "number | null")]
    pub max: Option<i64>,
}

/// The values of a configuration.
pub fn of(cfg: &Config) -> BTreeMap<String, Value> {
    [
        ("import", json!(cfg.import)),
        ("import_quality", json!(cfg.import_quality)),
        ("online", json!(cfg.online)),
        ("online_previews", json!(cfg.online_previews)),
        ("scan_interval_minutes", json!(cfg.scan_interval_minutes)),
        ("backup_days", json!(cfg.backup_days)),
        ("transcode_cache_mb", json!(cfg.transcode_cache_mb)),
        ("legacy_auth", json!(cfg.legacy_auth)),
        ("update_check", json!(cfg.update_check)),
        ("max_bit_rate", json!(cfg.max_bit_rate)),
        ("transcode_format", json!(cfg.transcode_format)),
    ]
    .into_iter()
    .map(|(k, v)| (k.to_owned(), v))
    .collect()
}

/// Checks a value for a setting; returns it as stored.
pub fn check(key: &str, value: &Value) -> Result<Value> {
    let Some((_, kind)) = SETTINGS.iter().find(|(k, _)| *k == key) else {
        bail!("unknown setting {key}");
    };
    Ok(match kind {
        Kind::Bool => json!(
            value
                .as_bool()
                .ok_or_else(|| anyhow::anyhow!("{key}: true or false"))?
        ),
        Kind::Int(min, max) => match value.as_i64() {
            Some(n) if (*min..=*max).contains(&n) => json!(n),
            _ => bail!("{key}: a whole number from {min} to {max}"),
        },
        Kind::Choice(all) => match value.as_str() {
            Some(s) if all.contains(&s) => json!(s),
            _ => bail!("{key}: one of {}", all.join(", ")),
        },
    })
}

/// Settings saved from the console.
pub fn saved(c: &Connection) -> Result<BTreeMap<String, Value>> {
    let mut out = BTreeMap::new();
    let mut st = c.prepare("SELECT key, value FROM property WHERE key LIKE 'setting.%'")?;
    let rows = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
    for row in rows {
        let (key, value) = row?;
        let key = key.trim_start_matches("setting.").to_owned();
        match serde_json::from_str::<Value>(&value)
            .map_err(anyhow::Error::from)
            .and_then(|v| check(&key, &v))
        {
            Ok(v) => {
                out.insert(key, v);
            }
            Err(e) => tracing::warn!("setting {key} ignored: {e:#}"),
        }
    }
    Ok(out)
}

pub fn save(c: &Connection, key: &str, value: &Value) -> Result<()> {
    c.execute(
        "INSERT INTO property(key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [format!("setting.{key}"), value.to_string()],
    )?;
    Ok(())
}

/// Puts the saved settings over the configuration.
pub fn apply(c: &Connection, cfg: &mut Config) -> Result<()> {
    for (key, v) in saved(c)? {
        match key.as_str() {
            "import" => cfg.import = v.as_bool().unwrap_or(cfg.import),
            "import_quality" => {
                if let Some(s) = v.as_str() {
                    cfg.import_quality = s.to_owned();
                }
            }
            "online" => cfg.online = v.as_bool().unwrap_or(cfg.online),
            "online_previews" => cfg.online_previews = v.as_bool().unwrap_or(cfg.online_previews),
            "scan_interval_minutes" => {
                cfg.scan_interval_minutes = v.as_u64().unwrap_or(cfg.scan_interval_minutes)
            }
            "backup_days" => cfg.backup_days = v.as_u64().unwrap_or(cfg.backup_days),
            "transcode_cache_mb" => {
                cfg.transcode_cache_mb = v.as_u64().unwrap_or(cfg.transcode_cache_mb)
            }
            "legacy_auth" => cfg.legacy_auth = v.as_bool().unwrap_or(cfg.legacy_auth),
            "update_check" => cfg.update_check = v.as_bool().unwrap_or(cfg.update_check),
            "max_bit_rate" => cfg.max_bit_rate = v.as_u64().map_or(cfg.max_bit_rate, |n| n as u32),
            "transcode_format" => {
                if let Some(s) = v.as_str() {
                    cfg.transcode_format = s.to_owned();
                }
            }
            _ => {}
        }
    }
    Ok(())
}

/// Every setting: what it will be, what it is now.
pub fn list(
    current: &BTreeMap<String, Value>,
    saved: &BTreeMap<String, Value>,
) -> Vec<SettingValue> {
    SETTINGS
        .iter()
        .map(|(key, kind)| {
            let now = current.get(*key).cloned().unwrap_or(Value::Null);
            SettingValue {
                key: (*key).to_owned(),
                value: saved.get(*key).cloned().unwrap_or_else(|| now.clone()),
                current: now,
                choices: match kind {
                    Kind::Choice(all) => Some(all.iter().map(|s| (*s).to_owned()).collect()),
                    _ => None,
                },
                min: match kind {
                    Kind::Int(min, _) => Some(*min),
                    _ => None,
                },
                max: match kind {
                    Kind::Int(_, max) => Some(*max),
                    _ => None,
                },
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saved_settings_go_over_the_configuration() {
        let db = crate::db::Db::memory().unwrap();
        let c = db.lock();
        save(&c, "import_quality", &json!("flac")).unwrap();
        save(&c, "backup_days", &json!(3)).unwrap();
        c.execute(
            "INSERT INTO property(key, value) VALUES ('setting.online', '\"yes\"')",
            [],
        )
        .unwrap();
        let mut cfg = Config::default();
        apply(&c, &mut cfg).unwrap();
        assert_eq!(cfg.import_quality, "flac");
        assert_eq!(cfg.backup_days, 3);
        assert!(cfg.online, "a wrong value is ignored");
        assert!(check("backup_days", &json!(1000)).is_err());
        assert!(check("import_quality", &json!("wav")).is_err());
        assert!(
            check("bind", &json!("0.0.0.0:80")).is_err(),
            "not changeable from the console"
        );
        let all = list(&of(&Config::default()), &saved(&c).unwrap());
        let q = all.iter().find(|s| s.key == "import_quality").unwrap();
        assert_eq!(
            (q.value.as_str(), q.current.as_str()),
            (Some("flac"), Some("mp3_320"))
        );
    }
}
