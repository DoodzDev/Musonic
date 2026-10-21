//! The console's « Appareils et sécurité » page (tranche C6): the devices of every account,
//! the addresses the sign-in limiter refuses now. Sign-ins come from the journal.
//!
//! | Route | |
//! |---|---|
//! | `GET /v1/admin/devices` | Device keys of every account, with where and when each last signed in |
//! | `GET /v1/admin/blocked` · `DELETE /v1/admin/blocked?addr=&username=` | Refused now · let them try again |

use axum::{
    Json, Router,
    extract::{Query, State},
    http::StatusCode,
    routing::get,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use ts_rs::TS;

use super::{ApiError, Auth, Reply};
use crate::{
    journal::{Entry, JournalQuery},
    server::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/v1/admin/devices", get(devices))
        .route("/v1/admin/blocked", get(blocked).delete(unblock))
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
pub struct Device {
    pub id: String,
    pub user_id: String,
    pub username: String,
    pub name: String,
    #[ts(type = "number")]
    pub created_at: i64,
    #[ts(type = "number | null")]
    pub last_used_at: Option<i64>,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SignIn {
    pub username: String,
    pub device: Option<String>,
    pub ip: Option<String>,
    #[ts(type = "number")]
    pub at: i64,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Devices {
    pub devices: Vec<Device>,
    /// Last sign-in of each (account, application, address), newest first.
    pub sign_ins: Vec<SignIn>,
}

async fn devices(State(state): State<AppState>, auth: Auth) -> Reply {
    admin(&auth)?;
    let devices = state
        .db
        .call(|c| {
            Ok(c.prepare(
                "SELECT k.id, k.user_id, u.username, k.name, k.created_at, k.last_used_at
                   FROM api_key k JOIN user u ON u.id = k.user_id
                  WHERE k.revoked_at IS NULL
                  ORDER BY coalesce(k.last_used_at, k.created_at) DESC",
            )?
            .query_map([], |r| {
                Ok(Device {
                    id: r.get(0)?,
                    user_id: r.get(1)?,
                    username: r.get(2)?,
                    name: r.get(3)?,
                    created_at: r.get(4)?,
                    last_used_at: r.get(5)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?)
        })
        .await?;
    let lines = state
        .journal
        .read(JournalQuery {
            kind: Some("login.ok".into()),
            limit: Some(500),
            ..Default::default()
        })
        .await?;
    let mut seen = std::collections::HashSet::new();
    let sign_ins = lines
        .into_iter()
        .filter(|e| seen.insert((e.user.clone(), e.device.clone(), e.ip.clone())))
        .take(100)
        .map(|e| SignIn {
            username: e.user.unwrap_or_default(),
            device: e.device,
            ip: e.ip,
            at: e.at,
        })
        .collect();
    Ok(Json(json!(Devices { devices, sign_ins })))
}

async fn blocked(State(state): State<AppState>, auth: Auth) -> Reply {
    admin(&auth)?;
    Ok(Json(json!(state.limiter.blocked())))
}

#[derive(Deserialize)]
struct Unblock {
    addr: String,
    username: String,
}

async fn unblock(State(state): State<AppState>, auth: Auth, Query(q): Query<Unblock>) -> Reply {
    admin(&auth)?;
    if !state.limiter.unblock(&q.addr, &q.username) {
        return Err(ApiError(StatusCode::NOT_FOUND, "not blocked".into()));
    }
    state.journal.log(
        Entry::new("login.unblocked")
            .by_admin(&auth.user.username)
            .target(&q.username)
            .ip(&q.addr),
    );
    Ok(Json(json!({})))
}
