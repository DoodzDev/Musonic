//! Account management for the administration console (RMP-005), and the two public pages of
//! links: accepting an invitation, choosing a new password.
//!
//! | Route | |
//! |---|---|
//! | `GET /v1/users` | Accounts, with their rights, devices and imports this month |
//! | `GET /v1/users/{id}` | One account, its device keys |
//! | `PATCH /v1/users/{id}` | `{isAdmin?, suspended?, displayName?}` (always one active administrator) |
//! | `PUT /v1/users/{id}/limits` | Rights and quotas (users who are not administrators) |
//! | `POST /v1/users/{id}/logout` | Ends its sessions, revokes its device keys |
//! | `DELETE /v1/users/{id}/api-keys/{key}` | Revokes one device key |
//! | `POST /v1/users/{id}/password-reset` | `{seconds, logoutDevices}` → a reset link token |
//! | `GET /v1/password-resets`, `DELETE /v1/password-resets/{id}` | Links not used yet |
//! | `GET /v1/invitations`, `POST /v1/invitations`, `DELETE /v1/invitations/{id}` | Invitation links (`{note, isAdmin, seconds}`) |
//! | `GET /v1/invite/{token}` · `POST /v1/invite/{token}` | Public: the invitation, then `{username, password}` creates the account |
//! | `GET /v1/reset/{token}` · `POST /v1/reset/{token}` | Public: the reset link, then `{password}` |

use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get, post, put},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use ts_rs::TS;

use super::{ApiError, Auth, Reply};
use crate::{
    server::AppState,
    users::{
        ApiKeyInfo, User,
        admin::{AccountChanges, Limits, LinkState},
    },
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/v1/users/{id}/limits", put(set_limits))
        .route("/v1/users/{id}/logout", post(logout_everywhere))
        .route("/v1/users/{id}/api-keys/{key}", delete(revoke_key))
        .route("/v1/users/{id}/password-reset", post(reset_link))
        .route("/v1/password-resets", get(resets))
        .route("/v1/password-resets/{id}", delete(revoke_reset))
        .route("/v1/invitations", get(invitations).post(invite))
        .route("/v1/invitations/{id}", delete(revoke_invitation))
        .route(
            "/v1/invite/{token}",
            get(invitation_page).post(accept_invitation),
        )
        .route("/v1/reset/{token}", get(reset_page).post(use_reset))
}

fn admin(auth: &Auth) -> Result<(), ApiError> {
    if auth.user.is_admin {
        Ok(())
    } else {
        Err(ApiError::forbidden())
    }
}

fn not_found() -> ApiError {
    ApiError(StatusCode::NOT_FOUND, "no such account".into())
}

/// An account as the console lists it.
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Account {
    pub id: String,
    pub username: String,
    pub display_name: String,
    pub is_admin: bool,
    pub suspended: bool,
    #[ts(type = "number")]
    pub created_at: i64,
    #[ts(type = "number | null")]
    pub last_login_at: Option<i64>,
    pub devices: u32,
    pub imports_this_month: u32,
    pub limits: Limits,
}

async fn account(state: &AppState, user: User) -> Result<Account, ApiError> {
    let id = user.id.clone();
    let (devices, imports): (u32, u32) = state
        .db
        .call(move |c| {
            Ok(c.query_row(
                "SELECT (SELECT count(*) FROM api_key WHERE user_id = ?1 AND revoked_at IS NULL),
                        (SELECT count(*) FROM import_job WHERE requested_by = ?1
                          AND created_at >= unixepoch('now', 'start of month'))",
                [&id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )?)
        })
        .await?;
    let limits = state.users.limits(&user.id).await?;
    Ok(Account {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        is_admin: user.is_admin,
        suspended: user.suspended,
        created_at: user.created_at,
        last_login_at: user.last_login_at,
        devices,
        imports_this_month: imports,
        limits,
    })
}

/// `GET /v1/users` (replaces the plain list): accounts with their rights, devices, imports.
pub async fn list_accounts(State(state): State<AppState>, auth: Auth) -> Reply {
    admin(&auth)?;
    let mut out = Vec::new();
    for u in state.users.list().await? {
        out.push(account(&state, u).await?);
    }
    Ok(Json(json!(out)))
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AccountDetail {
    pub account: Account,
    #[ts(
        type = "Array<{ id: string, name: string, created_at: number, last_used_at: number | null }>"
    )]
    pub api_keys: Vec<ApiKeyInfo>,
}

pub(super) async fn user(
    State(state): State<AppState>,
    auth: Auth,
    Path(id): Path<String>,
) -> Reply {
    admin(&auth)?;
    let u = state.users.get(&id).await?.ok_or_else(not_found)?;
    let keys = state.users.api_keys(&id).await?;
    Ok(Json(json!(AccountDetail {
        account: account(&state, u).await?,
        api_keys: keys,
    })))
}

pub(super) async fn update_user(
    State(state): State<AppState>,
    auth: Auth,
    Path(id): Path<String>,
    Json(changes): Json<AccountChanges>,
) -> Reply {
    admin(&auth)?;
    let u = state
        .users
        .update(&id, changes)
        .await
        .map_err(|e| ApiError::bad(e.to_string()))?
        .ok_or_else(not_found)?;
    Ok(Json(json!(account(&state, u).await?)))
}

async fn set_limits(
    State(state): State<AppState>,
    auth: Auth,
    Path(id): Path<String>,
    Json(limits): Json<Limits>,
) -> Reply {
    admin(&auth)?;
    state.users.get(&id).await?.ok_or_else(not_found)?;
    state.users.set_limits(&id, limits).await?;
    Ok(Json(json!(state.users.limits(&id).await?)))
}

async fn logout_everywhere(
    State(state): State<AppState>,
    auth: Auth,
    Path(id): Path<String>,
) -> Reply {
    admin(&auth)?;
    state.users.get(&id).await?.ok_or_else(not_found)?;
    state.users.logout_everywhere(&id).await?;
    Ok(Json(json!({})))
}

async fn revoke_key(
    State(state): State<AppState>,
    auth: Auth,
    Path((id, key)): Path<(String, String)>,
) -> Reply {
    admin(&auth)?;
    if state.users.revoke_api_key(&id, &key).await? {
        Ok(Json(json!({})))
    } else {
        Err(ApiError(StatusCode::NOT_FOUND, "no such key".into()))
    }
}

#[derive(Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ResetRequest {
    /// Validity in seconds.
    #[ts(type = "number")]
    pub seconds: i64,
    #[serde(default = "yes")]
    pub logout_devices: bool,
}

fn yes() -> bool {
    true
}

async fn reset_link(
    State(state): State<AppState>,
    auth: Auth,
    Path(id): Path<String>,
    Json(body): Json<ResetRequest>,
) -> Reply {
    admin(&auth)?;
    let (reset, token) = state
        .users
        .password_reset_link(&id, body.seconds, body.logout_devices, &auth.user.id)
        .await
        .map_err(|e| ApiError::bad(e.to_string()))?
        .ok_or_else(not_found)?;
    Ok(Json(json!({ "reset": reset, "token": token })))
}

async fn resets(State(state): State<AppState>, auth: Auth) -> Reply {
    admin(&auth)?;
    Ok(Json(json!(state.users.password_resets().await?)))
}

async fn revoke_reset(State(state): State<AppState>, auth: Auth, Path(id): Path<String>) -> Reply {
    admin(&auth)?;
    if state.users.revoke_password_reset(&id).await? {
        Ok(Json(json!({})))
    } else {
        Err(ApiError(StatusCode::NOT_FOUND, "no such link".into()))
    }
}

#[derive(Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct InvitationRequest {
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub is_admin: bool,
    /// Validity in seconds.
    #[ts(type = "number")]
    pub seconds: i64,
}

async fn invitations(State(state): State<AppState>, auth: Auth) -> Reply {
    admin(&auth)?;
    Ok(Json(json!(state.users.invitations().await?)))
}

async fn invite(
    State(state): State<AppState>,
    auth: Auth,
    Json(body): Json<InvitationRequest>,
) -> Reply {
    admin(&auth)?;
    let (invitation, token) = state
        .users
        .invite(&body.note, body.is_admin, body.seconds, &auth.user.id)
        .await
        .map_err(|e| ApiError::bad(e.to_string()))?;
    Ok(Json(json!({ "invitation": invitation, "token": token })))
}

async fn revoke_invitation(
    State(state): State<AppState>,
    auth: Auth,
    Path(id): Path<String>,
) -> Reply {
    admin(&auth)?;
    if state.users.revoke_invitation(&id).await? {
        Ok(Json(json!({})))
    } else {
        Err(ApiError(StatusCode::NOT_FOUND, "no such invitation".into()))
    }
}

// Public pages ---------------------------------------------------------------------------------

/// What an invitation or reset page shows.
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct LinkInfo {
    pub state: LinkState,
    /// Invitation: who invites. Reset: the account.
    pub name: Option<String>,
    #[ts(type = "number | null")]
    pub expires_at: Option<i64>,
}

async fn invitation_page(State(state): State<AppState>, Path(token): Path<String>) -> Reply {
    let (link, inv) = state.users.invitation_by_token(&token).await?;
    Ok(Json(json!(LinkInfo {
        state: link,
        name: inv.as_ref().and_then(|i| i.created_by.clone()),
        expires_at: inv.map(|i| i.expires_at),
    })))
}

#[derive(Deserialize)]
struct NewAccount {
    username: String,
    password: String,
}

async fn accept_invitation(
    State(state): State<AppState>,
    Path(token): Path<String>,
    Json(body): Json<NewAccount>,
) -> Reply {
    let user = state
        .users
        .accept_invitation(&token, &body.username, &body.password)
        .await
        .map_err(|e| ApiError::bad(e.to_string()))?;
    let session = state.users.create_session(&user.id).await?;
    Ok(Json(json!({ "token": session, "user": user })))
}

async fn reset_page(State(state): State<AppState>, Path(token): Path<String>) -> Reply {
    let (link, name) = state.users.password_reset_by_token(&token).await?;
    Ok(Json(json!(LinkInfo {
        state: link,
        name,
        expires_at: None,
    })))
}

#[derive(Deserialize)]
struct NewPassword {
    password: String,
}

async fn use_reset(
    State(state): State<AppState>,
    Path(token): Path<String>,
    Json(body): Json<NewPassword>,
) -> Reply {
    let user = state
        .users
        .use_password_reset(&token, &body.password)
        .await
        .map_err(|e| ApiError::bad(e.to_string()))?;
    Ok(Json(json!({ "username": user.username })))
}
