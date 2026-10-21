//! The console's « Réglages et maintenance » page (tranche C7).
//!
//! | Route | |
//! |---|---|
//! | `GET /v1/admin/settings` · `PUT /v1/admin/settings` | Server settings (`{key, value}`), applied at the next start |
//! | `POST /v1/admin/restart` | Restarts the server (its container or service starts it again) |
//! | `GET /v1/admin/backups` · `POST /v1/admin/backups` | Database backups · one now |
//! | `GET /v1/admin/backups/{name}` | Download one |
//! | `GET /v1/admin/logs` | Last lines of the technical logs (`level`, `after`) |
//! | `POST /v1/admin/caches/clear` | Empties the picture cache |
//! | `GET /v1/admin/webapp` · `POST /v1/admin/webapp/install` | Musonic Web hosted at `/app`: versions · install the latest |

use std::time::Duration;

use axum::{
    Json, Router,
    body::Body,
    extract::{Path, Query, State},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use ts_rs::TS;

use super::{ApiError, Auth, Reply};
use crate::{journal::Entry, server::AppState, settings};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/v1/admin/settings", get(list_settings).put(set_setting))
        .route("/v1/admin/restart", post(restart))
        .route("/v1/admin/backups", get(backups).post(backup_now))
        .route("/v1/admin/backups/{name}", get(download_backup))
        .route("/v1/admin/logs", get(logs))
        .route("/v1/admin/caches/clear", post(clear_caches))
        .route("/v1/admin/webapp", get(webapp))
        .route("/v1/admin/webapp/install", post(install_webapp))
}

fn admin(auth: &Auth) -> Result<(), ApiError> {
    if auth.user.is_admin {
        Ok(())
    } else {
        Err(ApiError::forbidden())
    }
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Settings {
    pub settings: Vec<settings::SettingValue>,
    /// A setting differs from what the server runs with: a restart applies it.
    pub restart_needed: bool,
}

async fn settings_reply(state: &AppState) -> Reply {
    let saved = state.db.call(|c| settings::saved(c)).await?;
    let list = settings::list(&state.settings_now, &saved);
    let restart_needed = list.iter().any(|s| s.value != s.current);
    Ok(Json(json!(Settings {
        settings: list,
        restart_needed
    })))
}

async fn list_settings(State(state): State<AppState>, auth: Auth) -> Reply {
    admin(&auth)?;
    settings_reply(&state).await
}

#[derive(Deserialize)]
struct SetSetting {
    key: String,
    value: Value,
}

async fn set_setting(
    State(state): State<AppState>,
    auth: Auth,
    Json(body): Json<SetSetting>,
) -> Reply {
    admin(&auth)?;
    let value =
        settings::check(&body.key, &body.value).map_err(|e| ApiError::bad(e.to_string()))?;
    let (key, v) = (body.key.clone(), value.clone());
    state.db.call(move |c| settings::save(c, &key, &v)).await?;
    state.journal.log(
        Entry::new("settings.changed")
            .by_admin(&auth.user.username)
            .target(&body.key)
            .detail(value.to_string().trim_matches('"')),
    );
    settings_reply(&state).await
}

async fn restart(State(state): State<AppState>, auth: Auth) -> Reply {
    admin(&auth)?;
    state
        .journal
        .log(Entry::new("server.restart").by_admin(&auth.user.username));
    tracing::info!("restart asked by {} from the console", auth.user.username);
    // After the answer has left; Docker (restart: unless-stopped) or systemd starts it again.
    tokio::spawn(async {
        tokio::time::sleep(Duration::from_millis(500)).await;
        std::process::exit(0);
    });
    Ok(Json(json!({})))
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Backup {
    pub name: String,
    #[ts(type = "number")]
    pub size: u64,
    #[ts(type = "number")]
    pub at: i64,
}

fn backup_dir(state: &AppState) -> std::path::PathBuf {
    state.data_dir.join("backups")
}

fn valid_backup(name: &str) -> bool {
    name.starts_with("musonic-")
        && name.ends_with(".db")
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.')
}

async fn backups(State(state): State<AppState>, auth: Auth) -> Reply {
    admin(&auth)?;
    let mut out: Vec<Backup> = std::fs::read_dir(backup_dir(&state))
        .map(|d| {
            d.filter_map(Result::ok)
                .filter_map(|e| {
                    let name = e.file_name().to_string_lossy().into_owned();
                    let m = e.metadata().ok()?;
                    valid_backup(&name).then(|| Backup {
                        name,
                        size: m.len(),
                        at: m
                            .modified()
                            .ok()
                            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                            .map(|d| d.as_secs() as i64)
                            .unwrap_or_default(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    out.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(Json(json!({
        "backups": out,
        "days": state.settings_now.get("backup_days").cloned().unwrap_or(json!(0)),
    })))
}

async fn backup_now(State(state): State<AppState>, auth: Auth) -> Reply {
    admin(&auth)?;
    let days = state
        .settings_now
        .get("backup_days")
        .and_then(Value::as_u64)
        .filter(|d| *d > 0)
        .unwrap_or(14);
    let path = state.db.daily_backup(&backup_dir(&state), days).await?;
    let size = std::fs::metadata(&path)
        .map(|m| m.len())
        .unwrap_or_default();
    state.journal.log(
        Entry::new("backup.done")
            .by_admin(&auth.user.username)
            .detail(size),
    );
    Ok(Json(
        json!({ "name": path.file_name().map(|n| n.to_string_lossy().into_owned()) }),
    ))
}

async fn download_backup(
    State(state): State<AppState>,
    auth: Auth,
    Path(name): Path<String>,
) -> Result<Response, ApiError> {
    admin(&auth)?;
    if !valid_backup(&name) {
        return Err(ApiError(StatusCode::NOT_FOUND, "no such backup".into()));
    }
    let file = tokio::fs::File::open(backup_dir(&state).join(&name))
        .await
        .map_err(|_| ApiError(StatusCode::NOT_FOUND, "no such backup".into()))?;
    state.journal.log(
        Entry::new("backup.downloaded")
            .by_admin(&auth.user.username)
            .target(&name),
    );
    Ok((
        [
            (header::CONTENT_TYPE, "application/vnd.sqlite3".to_owned()),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{name}\""),
            ),
        ],
        Body::from_stream(tokio_util::io::ReaderStream::new(file)),
    )
        .into_response())
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct LogQuery {
    level: Option<String>,
    after: u64,
}

async fn logs(auth: Auth, Query(q): Query<LogQuery>) -> Reply {
    admin(&auth)?;
    Ok(Json(json!(crate::logs::last(
        q.level.as_deref().unwrap_or("info"),
        q.after,
        500
    ))))
}

async fn clear_caches(State(state): State<AppState>, auth: Auth) -> Reply {
    admin(&auth)?;
    let dir = state.data_dir.join("cache");
    let freed = tokio::task::spawn_blocking(move || {
        let mut freed = 0u64;
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for e in entries.filter_map(Result::ok) {
                let p = e.path();
                freed += crate::metrics::size_of(&p);
                let _ = if p.is_dir() {
                    std::fs::remove_dir_all(&p)
                } else {
                    std::fs::remove_file(&p)
                };
            }
        }
        freed
    })
    .await
    .map_err(anyhow::Error::from)?;
    state.journal.log(
        Entry::new("caches.cleared")
            .by_admin(&auth.user.username)
            .detail(freed),
    );
    Ok(Json(json!({ "freed": freed })))
}

async fn webapp(State(state): State<AppState>, auth: Auth) -> Reply {
    admin(&auth)?;
    Ok(Json(json!(crate::webapp::status(&state.data_dir).await)))
}

async fn install_webapp(State(state): State<AppState>, auth: Auth) -> Reply {
    admin(&auth)?;
    match crate::webapp::install(&state.data_dir).await {
        Ok(version) => {
            state.journal.log(
                Entry::new("webapp.installed")
                    .by_admin(&auth.user.username)
                    .detail(&version),
            );
            Ok(Json(json!(crate::webapp::status(&state.data_dir).await)))
        }
        Err(e) => {
            tracing::warn!("installing Musonic Web: {e:#}");
            Err(ApiError(StatusCode::BAD_GATEWAY, format!("{e:#}")))
        }
    }
}
