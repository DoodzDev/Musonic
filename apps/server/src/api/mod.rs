//! Native API (`/v1`), JSON in and out. Errors: `{"error": "..."}` with an HTTP status.
//!
//! Authentication: `Authorization: Bearer <session token or API key>`.
//!
//! | Route | |
//! |---|---|
//! | `GET /v1/setup` | `{"needed": true}` until the first account exists |
//! | `POST /v1/setup` | First account (administrator); only while there is none |
//! | `POST /v1/auth/login` | `{username, password}` → `{token, user}` |
//! | `POST /v1/auth/logout` | Ends the session |
//! | `GET /v1/me` | The signed-in user |
//! | `PUT /v1/me/password` | `{current, new}` |
//! | `GET/POST /v1/me/api-keys`, `DELETE /v1/me/api-keys/{id}` | Per-device keys (`{name}` → key shown once) |
//! | `GET/POST /v1/users`, `DELETE /v1/users/{id}` | Accounts (administrators) |

use std::net::SocketAddr;

use axum::{
    Extension, Json, Router,
    extract::{ConnectInfo, FromRequestParts, Path, State},
    http::{HeaderMap, StatusCode, request::Parts},
    response::{IntoResponse, Response},
    routing::{delete, get, post, put},
};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::{server::AppState, users::User};

pub struct ApiError(StatusCode, String);

impl ApiError {
    fn bad(msg: impl Into<String>) -> Self {
        Self(StatusCode::BAD_REQUEST, msg.into())
    }
    fn unauthorized() -> Self {
        Self(StatusCode::UNAUTHORIZED, "sign in required".into())
    }
    fn forbidden() -> Self {
        Self(StatusCode::FORBIDDEN, "administrators only".into())
    }
}

impl From<anyhow::Error> for ApiError {
    fn from(e: anyhow::Error) -> Self {
        tracing::error!("api: {e:#}");
        Self(StatusCode::INTERNAL_SERVER_ERROR, "internal error".into())
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({ "error": self.1 }))).into_response()
    }
}

type Reply = Result<Json<Value>, ApiError>;

/// The signed-in user (session token or API key in `Authorization: Bearer`).
pub struct Auth {
    pub user: User,
    token: String,
}

impl FromRequestParts<AppState> for Auth {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, ApiError> {
        let token = parts
            .headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .map(str::trim)
            .filter(|t| !t.is_empty())
            .ok_or_else(ApiError::unauthorized)?
            .to_owned();
        let user = if token.starts_with(crate::users::API_KEY_PREFIX) {
            state.users.check_api_key(&token).await?.ok()
        } else {
            state.users.check_session(&token).await?
        };
        user.map(|user| Auth { user, token })
            .ok_or_else(ApiError::unauthorized)
    }
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/v1/setup", get(setup_needed).post(setup))
        .route("/v1/auth/login", post(login))
        .route("/v1/auth/logout", post(logout))
        .route("/v1/me", get(me))
        .route("/v1/me/password", put(change_password))
        .route("/v1/me/api-keys", get(list_keys).post(create_key))
        .route("/v1/me/api-keys/{id}", delete(revoke_key))
        .route("/v1/users", get(list_users).post(create_user))
        .route("/v1/users/{id}", delete(delete_user))
}

#[derive(Deserialize)]
struct Credentials {
    username: String,
    password: String,
}

async fn setup_needed(State(state): State<AppState>) -> Reply {
    Ok(Json(json!({ "needed": state.users.count().await? == 0 })))
}

async fn setup(State(state): State<AppState>, Json(body): Json<Credentials>) -> Reply {
    // Checked again inside a single setup at a time: two first requests cannot both win.
    let _guard = state.setup_lock.lock().await;
    if state.users.count().await? > 0 {
        return Err(ApiError(
            StatusCode::CONFLICT,
            "the server is already set up".into(),
        ));
    }
    let user = state
        .users
        .create(&body.username, &body.password, true)
        .await
        .map_err(|e| ApiError::bad(e.to_string()))?;
    let token = state.users.create_session(&user.id).await?;
    Ok(Json(json!({ "token": token, "user": user })))
}

async fn login(
    State(state): State<AppState>,
    peer: Option<Extension<ConnectInfo<SocketAddr>>>,
    headers: HeaderMap,
    Json(body): Json<Credentials>,
) -> Reply {
    let from = crate::server::client_addr(&headers, peer.map(|p| p.0.0));
    if !state.limiter.allowed(&from, &body.username) {
        return Err(ApiError(
            StatusCode::TOO_MANY_REQUESTS,
            "too many failed attempts, try again later".into(),
        ));
    }
    match state
        .users
        .check_password(&body.username, &body.password)
        .await?
    {
        Ok(user) => {
            state.limiter.succeeded(&from, &body.username);
            let token = state.users.create_session(&user.id).await?;
            Ok(Json(json!({ "token": token, "user": user })))
        }
        Err(_) => {
            state.limiter.failed(&from, &body.username);
            Err(ApiError(
                StatusCode::UNAUTHORIZED,
                "wrong username or password".into(),
            ))
        }
    }
}

async fn logout(State(state): State<AppState>, auth: Auth) -> Reply {
    state.users.end_session(&auth.token).await?;
    Ok(Json(json!({})))
}

async fn me(auth: Auth) -> Reply {
    Ok(Json(json!(auth.user)))
}

#[derive(Deserialize)]
struct NewPassword {
    current: String,
    new: String,
}

async fn change_password(
    State(state): State<AppState>,
    auth: Auth,
    Json(body): Json<NewPassword>,
) -> Reply {
    if state
        .users
        .check_password(&auth.user.username, &body.current)
        .await?
        .is_err()
    {
        return Err(ApiError(
            StatusCode::FORBIDDEN,
            "wrong current password".into(),
        ));
    }
    state
        .users
        .set_password(&auth.user.id, &body.new)
        .await
        .map_err(|e| ApiError::bad(e.to_string()))?;
    Ok(Json(json!({})))
}

#[derive(Deserialize)]
struct KeyName {
    name: String,
}

async fn list_keys(State(state): State<AppState>, auth: Auth) -> Reply {
    Ok(Json(json!(state.users.api_keys(&auth.user.id).await?)))
}

async fn create_key(State(state): State<AppState>, auth: Auth, Json(body): Json<KeyName>) -> Reply {
    if body.name.trim().is_empty() {
        return Err(ApiError::bad("a name is needed (the device or app)"));
    }
    let (info, key) = state
        .users
        .create_api_key(&auth.user.id, &body.name)
        .await?;
    Ok(Json(json!({ "key": key, "info": info })))
}

async fn revoke_key(State(state): State<AppState>, auth: Auth, Path(id): Path<String>) -> Reply {
    if !state.users.revoke_api_key(&auth.user.id, &id).await? {
        return Err(ApiError(StatusCode::NOT_FOUND, "no such key".into()));
    }
    Ok(Json(json!({})))
}

async fn list_users(State(state): State<AppState>, auth: Auth) -> Reply {
    if !auth.user.is_admin {
        return Err(ApiError::forbidden());
    }
    Ok(Json(json!(state.users.list().await?)))
}

#[derive(Deserialize)]
struct NewUser {
    username: String,
    password: String,
    #[serde(default)]
    admin: bool,
}

async fn create_user(
    State(state): State<AppState>,
    auth: Auth,
    Json(body): Json<NewUser>,
) -> Reply {
    if !auth.user.is_admin {
        return Err(ApiError::forbidden());
    }
    let user = state
        .users
        .create(&body.username, &body.password, body.admin)
        .await
        .map_err(|e| ApiError::bad(e.to_string()))?;
    Ok(Json(json!(user)))
}

async fn delete_user(State(state): State<AppState>, auth: Auth, Path(id): Path<String>) -> Reply {
    if !auth.user.is_admin {
        return Err(ApiError::forbidden());
    }
    match state.users.delete(&id).await {
        Ok(true) => Ok(Json(json!({}))),
        Ok(false) => Err(ApiError(StatusCode::NOT_FOUND, "no such user".into())),
        Err(e) => Err(ApiError::bad(e.to_string())),
    }
}

#[cfg(test)]
mod tests;
