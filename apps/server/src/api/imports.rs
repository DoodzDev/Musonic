//! The console's « Imports » page (tranche C4): the import queue, its providers, their
//! credentials. Import settings (on/off, quality…) are server settings ([`super::system`]).
//!
//! | Route | |
//! |---|---|
//! | `GET /v1/admin/imports` | Jobs (`state`: `pending`, `running`, `failed`, `done` or all; `q`, `offset`, `limit`) and counts |
//! | `POST /v1/admin/imports/{track}/retry` · `DELETE /v1/admin/imports/{track}` | Try again now · remove from the queue |
//! | `POST /v1/admin/imports/retry-failed` | Every job given up, again |
//! | `GET /v1/admin/providers` | Audio providers, their state, whether their credential can be changed |
//! | `PUT /v1/admin/providers/{id}/credential` | `{value}`: a new ARL…, checked before it replaces the old one |

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{delete, get, post, put},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use ts_rs::TS;

use super::{ApiError, Auth, Reply};
use crate::{journal::Entry, server::AppState};

const SECRET_PREFIX: &str = "secret.provider.";

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/v1/admin/imports", get(list))
        .route("/v1/admin/imports/retry-failed", post(retry_failed))
        .route("/v1/admin/imports/{track}/retry", post(retry))
        .route("/v1/admin/imports/{track}", delete(remove))
        .route("/v1/admin/providers", get(providers))
        .route("/v1/admin/providers/{id}/credential", put(set_credential))
}

fn admin(auth: &Auth) -> Result<(), ApiError> {
    if auth.user.is_admin {
        Ok(())
    } else {
        Err(ApiError::forbidden())
    }
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct ListQuery {
    state: Option<String>,
    q: Option<String>,
    offset: u32,
    limit: Option<u32>,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ImportJob {
    pub track_id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    /// `pending`, `running`, `done`, `failed`.
    pub state: String,
    pub attempts: u32,
    pub last_error: Option<String>,
    pub provider: Option<String>,
    pub path: Option<String>,
    pub requested_by: Option<String>,
    #[ts(type = "number")]
    pub created_at: i64,
    #[ts(type = "number")]
    pub updated_at: i64,
    #[ts(type = "number")]
    pub next_try_at: i64,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ImportList {
    pub jobs: Vec<ImportJob>,
    #[ts(type = "{ pending: number, running: number, failed: number, done: number }")]
    pub counts: crate::library::import::ImportCounts,
    /// Matching jobs (all pages).
    pub total: u32,
}

async fn list(State(state): State<AppState>, auth: Auth, Query(q): Query<ListQuery>) -> Reply {
    admin(&auth)?;
    let out = state
        .db
        .call(move |c| {
            let mut sql = String::from(
                " FROM import_job j JOIN track t ON t.id = j.track_id
                  LEFT JOIN album a ON a.id = t.album_id
                  LEFT JOIN user u ON u.id = j.requested_by WHERE 1",
            );
            let mut args: Vec<String> = Vec::new();
            if let Some(s) = q.state.filter(|s| ["pending", "running", "done", "failed"].contains(&s.as_str())) {
                sql += " AND j.state = ?";
                args.push(s);
            }
            if let Some(text) = q.q.map(|s| s.trim().to_owned()).filter(|s| !s.is_empty()) {
                sql += " AND (t.title LIKE ? OR t.artist_display LIKE ? OR a.title LIKE ? OR u.username LIKE ?)";
                let like = format!("%{text}%");
                args.extend(std::iter::repeat_n(like, 4));
            }
            let total: u32 = c.query_row(
                &format!("SELECT count(*){sql}"),
                rusqlite::params_from_iter(&args),
                |r| r.get(0),
            )?;
            let limit = q.limit.unwrap_or(100).clamp(1, 500);
            let jobs = c
                .prepare(&format!(
                    "SELECT j.track_id, t.title, t.artist_display, a.title, j.state, j.attempts,
                            j.last_error, j.provider, j.path, u.username, j.created_at, j.updated_at,
                            j.next_try_at{sql}
                      ORDER BY CASE j.state WHEN 'running' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
                               j.updated_at DESC
                      LIMIT {limit} OFFSET {}",
                    q.offset
                ))?
                .query_map(rusqlite::params_from_iter(&args), |r| {
                    Ok(ImportJob {
                        track_id: r.get(0)?,
                        title: r.get(1)?,
                        artist: r.get(2)?,
                        album: r.get(3)?,
                        state: r.get(4)?,
                        attempts: r.get(5)?,
                        last_error: r.get(6)?,
                        provider: r.get(7)?,
                        path: r.get(8)?,
                        requested_by: r.get(9)?,
                        created_at: r.get(10)?,
                        updated_at: r.get(11)?,
                        next_try_at: r.get(12)?,
                    })
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(ImportList {
                jobs,
                counts: crate::library::import::counts(c)?,
                total,
            })
        })
        .await?;
    Ok(Json(json!(out)))
}

fn wake(state: &AppState) {
    if let Some(imports) = &state.imports {
        imports.wake();
    }
}

async fn retry(State(state): State<AppState>, auth: Auth, Path(track): Path<String>) -> Reply {
    admin(&auth)?;
    let changed = state
        .db
        .call(move |c| {
            Ok(c.execute(
                "UPDATE import_job SET state = 'pending', attempts = 0, last_error = NULL,
                     next_try_at = unixepoch(), updated_at = unixepoch()
                  WHERE track_id = ?1 AND state IN ('pending', 'failed')",
                [&track],
            )?)
        })
        .await?;
    if changed == 0 {
        return Err(ApiError(
            StatusCode::NOT_FOUND,
            "no import to try again".into(),
        ));
    }
    wake(&state);
    Ok(Json(json!({})))
}

async fn retry_failed(State(state): State<AppState>, auth: Auth) -> Reply {
    admin(&auth)?;
    let n = state
        .db
        .call(|c| {
            Ok(c.execute(
                "UPDATE import_job SET state = 'pending', attempts = 0, last_error = NULL,
                     next_try_at = unixepoch(), updated_at = unixepoch()
                  WHERE state = 'failed'",
                [],
            )?)
        })
        .await?;
    if n > 0 {
        state.journal.log(
            Entry::new("import.retried")
                .by_admin(&auth.user.username)
                .detail(n),
        );
        wake(&state);
    }
    Ok(Json(json!({ "retried": n })))
}

async fn remove(State(state): State<AppState>, auth: Auth, Path(track): Path<String>) -> Reply {
    admin(&auth)?;
    let removed = state
        .db
        .call(move |c| {
            Ok(c.execute(
                "DELETE FROM import_job WHERE track_id = ?1 AND state IN ('pending', 'failed')",
                [&track],
            )?)
        })
        .await?;
    if removed == 0 {
        return Err(ApiError(
            StatusCode::NOT_FOUND,
            "no import to cancel".into(),
        ));
    }
    Ok(Json(json!({})))
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ProviderInfo {
    pub id: String,
    /// Its files may be imported (not only previews).
    pub imports: bool,
    /// The alert it has (`credentials_expired`), if any.
    pub alert: Option<String>,
    /// The secret the console can change (`ARL`…).
    pub credential: Option<String>,
    /// When that secret was last changed from the console (Unix seconds).
    #[ts(type = "number | null")]
    pub credential_changed_at: Option<i64>,
}

async fn providers(State(state): State<AppState>, auth: Auth) -> Reply {
    admin(&auth)?;
    let alerts = state.provider_health.alerts();
    let changed: Vec<(String, i64)> = state
        .db
        .call(|c| {
            Ok(
                c.prepare("SELECT key, value FROM property WHERE key LIKE 'changed.provider.%'")?
                    .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
                    .filter_map(Result::ok)
                    .filter_map(|(k, v)| {
                        Some((
                            k.trim_start_matches("changed.provider.").to_owned(),
                            v.parse().ok()?,
                        ))
                    })
                    .collect(),
            )
        })
        .await?;
    let out: Vec<ProviderInfo> = state
        .providers
        .iter()
        .map(|p| ProviderInfo {
            id: p.id().to_owned(),
            imports: p.imports(),
            alert: alerts.get(p.id()).cloned(),
            credential: p.credential().map(str::to_owned),
            credential_changed_at: changed
                .iter()
                .find(|(id, _)| id == p.id())
                .map(|(_, at)| *at),
        })
        .collect();
    Ok(Json(json!(out)))
}

#[derive(Deserialize)]
struct NewCredential {
    value: String,
}

async fn set_credential(
    State(state): State<AppState>,
    auth: Auth,
    Path(id): Path<String>,
    Json(body): Json<NewCredential>,
) -> Reply {
    admin(&auth)?;
    let Some(p) = state
        .providers
        .iter()
        .find(|p| p.id() == id && p.credential().is_some())
        .cloned()
    else {
        return Err(ApiError(StatusCode::NOT_FOUND, "no such provider".into()));
    };
    let value = body.value.trim().to_owned();
    if value.is_empty() {
        return Err(ApiError::bad("empty value"));
    }
    if let Err(e) = p.set_credential(&value).await {
        tracing::warn!("provider {id}: new credential refused: {e:#}");
        return Err(ApiError(
            StatusCode::UNPROCESSABLE_ENTITY,
            "refused by the provider".into(),
        ));
    }
    let key = id.clone();
    state
        .db
        .call(move |c| {
            c.execute(
                "INSERT INTO property(key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                [format!("{SECRET_PREFIX}{key}"), value],
            )?;
            c.execute(
                "INSERT INTO property(key, value) VALUES (?1, unixepoch())
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                [format!("changed.provider.{key}")],
            )?;
            Ok(())
        })
        .await?;
    state.provider_health.clear(p.id());
    state.journal.log(
        Entry::new("provider.credential")
            .by_admin(&auth.user.username)
            .target(p.id()),
    );
    Ok(Json(json!({})))
}

/// At start: providers get the credential last set from the console (over the environment).
pub async fn restore_credentials(state: &AppState) {
    for p in state.providers.iter().filter(|p| p.credential().is_some()) {
        let key = format!("{SECRET_PREFIX}{}", p.id());
        let saved: Option<String> = state
            .db
            .call(move |c| {
                Ok(
                    c.query_row("SELECT value FROM property WHERE key = ?1", [&key], |r| {
                        r.get(0)
                    })
                    .ok(),
                )
            })
            .await
            .ok()
            .flatten();
        if let Some(value) = saved {
            match p.set_credential(&value).await {
                Ok(()) => tracing::info!("provider {}: credential set from the console", p.id()),
                Err(e) => tracing::warn!(
                    "provider {}: credential from the console refused: {e:#}",
                    p.id()
                ),
            }
        }
    }
}
