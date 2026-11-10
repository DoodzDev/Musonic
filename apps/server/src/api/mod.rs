//! Native API (`/v1`), JSON in and out. Errors: `{"error": "..."}` with an HTTP status.
//!
//! Authentication: `Authorization: Bearer <session token or API key>`.
//!
//! | Route | |
//! |---|---|
//! | `GET /v1/events` | WebSocket of real-time events for the signed-in account (ADR-018); token also as `?token=`, device id as `?device=`. Musonic Connect (ADR-019) goes both ways on it: `register`, `player`, `command` |
//! | `GET/PUT /v1/me/settings` | `{connectSync}`: synced playback (Musonic Connect) |
//! | `GET /v1/me/player` | The account's last listening (Musonic Connect state), to resume it on any device |
//! | `GET /v1/admin/connect` | Every account's devices online and what they play |
//! | `/v1/admin/imports…`, `/v1/admin/providers…` | « Imports » page ([`imports`]) |
//! | `/v1/admin/library…` | « Bibliothèque » page ([`library_admin`]) |
//! | `/v1/admin/devices`, `/v1/admin/blocked` | « Appareils et sécurité » page ([`security`]) |
//! | `/v1/admin/settings`, `restart`, `backups…`, `logs`, `caches/clear`, `webapp…` | « Réglages et maintenance » page ([`system`]) |
//! | `GET /v1/admin/journal`, `PUT /v1/admin/journal/settings` | « Activité » and administration journal of the console ([`journal`]) |
//! | `POST /v1/admin/measures`, `PUT /v1/admin/traffic-quota` | « Données » page of the console: traffic, processor, memory, disk over time ([`measures`]) |
//! | `GET /v1/admin/status` | Dashboard and event bar of the console (administrators): live figures, disk, library, now playing, alerts, releases |
//! | `GET /v1/admin/podcasts`, `PUT /v1/admin/podcasts/index` | Podcast Index key ([`podcasts`]) |
//! | `GET /v1/admin/health` | The server's state in detail (administrators): version, schema, last scan, providers, alerts, imports; the public `/health` only says `ok` |
//! | `GET /v1/info` | What this server is and can do (no sign-in): clients tell Musonic Server from another Subsonic server with it |
//! | `GET /v1/setup` | `{"needed": true}` until the first account exists |
//! | `POST /v1/setup` | First account (administrator); only while there is none |
//! | `POST /v1/auth/login` | `{username, password}` → `{token, user}` |
//! | `POST /v1/auth/logout` | Ends the session |
//! | `GET /v1/me` | The signed-in user |
//! | `PUT /v1/me/password` | `{current, new}` |
//! | `GET/POST /v1/me/api-keys`, `DELETE /v1/me/api-keys/{id}` | Per-device keys (`{name}` → key shown once) |
//! | `GET/POST /v1/users`, `GET/PATCH/DELETE /v1/users/{id}` | Accounts (administrators); the console creates them by invitation (see [`admin`]) |

use std::net::SocketAddr;

use axum::{
    Extension, Json, Router,
    extract::{
        ConnectInfo, FromRequestParts, Path, Query, State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    http::{HeaderMap, StatusCode, request::Parts},
    response::{IntoResponse, Response},
    routing::{delete, get, post, put},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{server::AppState, users::User};

mod admin;
mod imports;
pub use imports::restore_credentials;
mod journal;
mod library_admin;
mod measures;
mod playlist_imports;
mod podcasts;
mod security;
mod status;
mod system;

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

fn bearer(headers: &HeaderMap) -> Option<String> {
    headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .map(str::to_owned)
}

/// The user of a session token or an API key.
async fn user_of(state: &AppState, token: &str) -> Result<Option<User>, ApiError> {
    Ok(if token.starts_with(crate::users::API_KEY_PREFIX) {
        state.users.check_api_key(token).await?.ok()
    } else {
        state.users.check_session(token).await?
    })
}

impl FromRequestParts<AppState> for Auth {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, ApiError> {
        let token = bearer(&parts.headers).ok_or_else(ApiError::unauthorized)?;
        user_of(state, &token)
            .await?
            .map(|user| Auth { user, token })
            .ok_or_else(ApiError::unauthorized)
    }
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/v1/info", get(info))
        .route("/v1/admin/status", get(status::status))
        .route("/v1/admin/health", get(status::health))
        .route("/v1/events", get(events))
        .route("/v1/setup", get(setup_needed).post(setup))
        .route("/v1/auth/login", post(login))
        .route("/v1/auth/logout", post(logout))
        .route("/v1/me", get(me))
        .route("/v1/me/password", put(change_password))
        .route("/v1/me/settings", get(my_settings).put(set_my_settings))
        .route("/v1/me/player", get(my_player))
        .route("/v1/admin/connect", get(connect_overview))
        .route("/v1/me/api-keys", get(list_keys).post(create_key))
        .route("/v1/me/api-keys/{id}", delete(revoke_key))
        .route("/v1/users", get(admin::list_accounts).post(create_user))
        .route(
            "/v1/users/{id}",
            get(admin::user)
                .patch(admin::update_user)
                .delete(delete_user),
        )
        .merge(admin::router())
        .merge(measures::router())
        .merge(journal::router())
        .merge(imports::router())
        .merge(library_admin::router())
        .merge(security::router())
        .merge(system::router())
        .merge(playlist_imports::router())
        .merge(podcasts::router())
}

/// Version of the native API; raised when it changes in a way clients must know.
pub const API_VERSION: u32 = 1;

/// What this server can do, as listed by `/v1/info` (see ADR-018).
pub fn features(state: &AppState) -> Vec<String> {
    let mut f = vec!["events", "connect"];
    if state.online.is_some() {
        f.push("online");
    }
    if state.imports.is_some() {
        f.push("imports");
    }
    f.into_iter().map(str::to_owned).collect()
}

/// `GET /v1/info`. Its TypeScript type is generated in `packages/core`.
#[derive(Serialize, ts_rs::TS)]
#[ts(export)]
pub struct ServerInfo {
    /// Always `musonic`.
    pub server: String,
    pub version: String,
    /// Version of the native API.
    pub api: u32,
    /// `events`, `online`, `imports`…
    pub features: Vec<String>,
}

#[derive(Deserialize)]
struct EventsQuery {
    token: Option<String>,
    device: Option<String>,
}

/// Seconds between keep-alive pings (Cloudflare closes idle connections after 100 s).
const EVENTS_PING: std::time::Duration = std::time::Duration::from_secs(30);

async fn events(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<EventsQuery>,
    ws: WebSocketUpgrade,
) -> Result<Response, ApiError> {
    let token = bearer(&headers)
        .or(q.token.filter(|t| !t.is_empty()))
        .ok_or_else(ApiError::unauthorized)?;
    let user = user_of(&state, &token)
        .await?
        .ok_or_else(ApiError::unauthorized)?;
    let device = crate::events::device(&headers, q.device.as_deref());
    Ok(ws.on_upgrade(move |socket| stream_events(socket, state, user, device)))
}

async fn stream_events(mut socket: WebSocket, state: AppState, user: User, device: Option<String>) {
    use crate::events::{Event, EventMessage, UserRef};
    use tokio::sync::broadcast::error::RecvError;
    let send = |v: &Value| Message::Text(v.to_string().into());
    let typed = |e: Event| EventMessage::new(None, e).to_json();
    let mut rx = state.events.subscribe();
    let hello = typed(Event::Hello {
        user: UserRef {
            id: user.id.clone(),
            username: user.username.clone(),
        },
        device: device.clone(),
        features: features(&state),
    });
    if socket.send(send(&hello)).await.is_err() {
        return;
    }
    // Musonic Connect: this connection's device (the client's id, else one of its own).
    static CONNECTIONS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let conn = CONNECTIONS.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let me = device
        .clone()
        .unwrap_or_else(|| format!("connection-{conn}"));
    let mut registered = false;
    let mut ping = tokio::time::interval(EVENTS_PING);
    ping.tick().await;
    loop {
        tokio::select! {
            event = rx.recv() => {
                let message = match event {
                    Ok(e) if e.user_id == user.id => e.message,
                    Ok(_) => continue,
                    // Too slow: some events were missed, the device reloads.
                    Err(RecvError::Lagged(_)) => std::sync::Arc::new(typed(Event::Resync)),
                    Err(RecvError::Closed) => break,
                };
                if socket.send(send(&message)).await.is_err() {
                    break;
                }
            }
            _ = ping.tick() => {
                if socket.send(send(&typed(Event::Ping))).await.is_err() {
                    break;
                }
            }
            incoming = socket.recv() => match incoming {
                None | Some(Err(_)) | Some(Ok(Message::Close(_))) => break,
                Some(Ok(Message::Text(text))) => {
                    let replies = connect_message(&state, &user, conn, &me, &text, &mut registered);
                    for reply in replies {
                        if socket.send(send(&typed(reply))).await.is_err() {
                            break;
                        }
                    }
                }
                Some(Ok(_)) => {}
            },
        }
    }
    if registered && let Some(last) = state.connect.leave(&state.events, &user.id, conn) {
        keep_last_listening(&state, &user.id, last);
    }
}

/// Saves the account's last listening (`GET /v1/me/player`), in the background.
fn keep_last_listening(state: &AppState, user: &str, player: crate::connect::Player) {
    let Ok(json) = serde_json::to_string(&player) else {
        return;
    };
    let (db, user) = (state.db.clone(), user.to_owned());
    tokio::spawn(async move {
        let saved = db
            .call(move |c| {
                c.prepare_cached(
                    "INSERT INTO connect_state(user_id, state, updated_at) VALUES (?1, ?2, unixepoch())
                     ON CONFLICT(user_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at",
                )?
                .execute([&user, &json])?;
                Ok(())
            })
            .await;
        if let Err(e) = saved {
            tracing::warn!("last listening not saved: {e}");
        }
    });
}

/// `GET /v1/me/player`: the account's last listening, or `null`.
async fn my_player(State(state): State<AppState>, auth: Auth) -> Reply {
    use rusqlite::OptionalExtension;
    let id = auth.user.id.clone();
    let saved: Option<(String, i64)> = state
        .db
        .call(move |c| {
            Ok(c.query_row(
                "SELECT state, updated_at FROM connect_state WHERE user_id = ?1",
                [&id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?)
        })
        .await?;
    let player = saved
        .as_ref()
        .and_then(|(s, _)| serde_json::from_str::<crate::connect::Player>(s).ok());
    Ok(Json(
        json!({ "player": player, "updatedAt": saved.map(|(_, at)| at) }),
    ))
}

/// A Musonic Connect message from a device (ADR-019); returns what to answer that device only.
/// Anything else (or malformed) is ignored, as before Connect.
fn connect_message(
    state: &AppState,
    user: &User,
    conn: u64,
    me: &str,
    text: &str,
    registered: &mut bool,
) -> Vec<crate::events::Event> {
    use crate::connect::{Incoming, Refused, now_ms};
    use crate::events::Event;
    let Ok(message) = serde_json::from_str::<Incoming>(text) else {
        return vec![];
    };
    match message {
        Incoming::Register(mut device) => {
            device.id = me.to_owned();
            device.name = device.name.chars().take(64).collect();
            *registered = true;
            state
                .connect
                .register(&state.events, &user.id, conn, device)
                .into_iter()
                .map(|player| Event::Player {
                    player,
                    now: now_ms(),
                })
                .collect()
        }
        // A device that did not register is not listed: what it plays is not kept either.
        Incoming::Player(player) if *registered => {
            if let Some(last) = state.connect.player(&state.events, &user.id, me, player) {
                keep_last_listening(state, &user.id, last);
            }
            vec![]
        }
        Incoming::Player(_) => vec![],
        Incoming::Command(command) => {
            match state
                .connect
                .command(&state.events, &user.id, user.is_admin, me, command.clone())
            {
                Ok(()) => vec![],
                Err(refused) => vec![Event::CommandFailed {
                    command,
                    reason: match refused {
                        Refused::Offline => "offline",
                        Refused::NotAllowed => "notAllowed",
                    }
                    .to_owned(),
                }],
            }
        }
    }
}

/// `GET /v1/me/settings`: the account's settings.
async fn my_settings(State(state): State<AppState>, auth: Auth) -> Reply {
    let id = auth.user.id.clone();
    let sync: bool = state
        .db
        .call(move |c| {
            Ok(
                c.query_row("SELECT connect_sync FROM user WHERE id = ?1", [&id], |r| {
                    r.get::<_, i64>(0)
                })? != 0,
            )
        })
        .await?;
    Ok(Json(json!({ "connectSync": sync })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MySettings {
    connect_sync: bool,
}

/// `PUT /v1/me/settings`: `{connectSync}`; the account's devices learn it at once.
async fn set_my_settings(
    State(state): State<AppState>,
    auth: Auth,
    Json(body): Json<MySettings>,
) -> Reply {
    let (id, sync) = (auth.user.id.clone(), body.connect_sync);
    state
        .db
        .call(move |c| {
            Ok(c.execute(
                "UPDATE user SET connect_sync = ?2 WHERE id = ?1",
                rusqlite::params![id, sync as i64],
            )?)
        })
        .await?;
    state.events.emit(
        &auth.user.id,
        None,
        crate::events::Event::Settings { connect_sync: sync },
    );
    Ok(Json(json!({ "connectSync": sync })))
}

/// `GET /v1/admin/connect`: every account with a device online (console, ADR-019 § 7).
async fn connect_overview(State(state): State<AppState>, auth: Auth) -> Reply {
    if !auth.user.is_admin {
        return Err(ApiError(
            StatusCode::FORBIDDEN,
            "administrators only".into(),
        ));
    }
    let accounts: Vec<Value> = state
        .connect
        .overview()
        .into_iter()
        .map(|(user, devices, players)| json!({ "user": user, "devices": devices, "players": players }))
        .collect();
    Ok(Json(json!({ "accounts": accounts })))
}

async fn info(State(state): State<AppState>) -> Reply {
    Ok(Json(json!(ServerInfo {
        server: "musonic".to_owned(),
        version: env!("CARGO_PKG_VERSION").to_owned(),
        api: API_VERSION,
        features: features(&state),
    })))
}

#[derive(Deserialize)]
struct Credentials {
    username: String,
    #[serde(default)]
    password: String,
    /// Instead of the password: the Subsonic token `md5(password + salt)` and its salt, for
    /// clients that keep only those (Musonic Web). Follows the legacy sign-in setting.
    #[serde(default)]
    token: Option<String>,
    #[serde(default)]
    salt: Option<String>,
    /// The application signing in (`Musonic Web`, `Console`…), for the journal.
    #[serde(default)]
    client: Option<String>,
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
    state.journal.log(
        crate::journal::Entry::new("account.created")
            .user(&user.username)
            .target(&user.username)
            .detail("setup"),
    );
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
    let client = body.client.as_deref();
    if !state.limiter.allowed(&from, &body.username) {
        state
            .journal
            .refused("login.blocked", &body.username, client, &from);
        return Err(ApiError(
            StatusCode::TOO_MANY_REQUESTS,
            "too many failed attempts, try again later".into(),
        ));
    }
    let checked = match (&body.token, &body.salt) {
        (Some(token), Some(salt)) if body.password.is_empty() => {
            state.users.check_token(&body.username, token, salt).await?
        }
        _ => {
            state
                .users
                .check_password(&body.username, &body.password)
                .await?
        }
    };
    match checked {
        Ok(user) => {
            state.limiter.succeeded(&from, &body.username);
            state.journal.log(
                crate::journal::Entry::new("login.ok")
                    .user(&user.username)
                    .ip(&from)
                    .device(client),
            );
            let token = state.users.create_session(&user.id).await?;
            Ok(Json(json!({ "token": token, "user": user })))
        }
        Err(crate::users::AuthError::Suspended) => {
            state
                .journal
                .refused("login.suspended", &body.username, client, &from);
            Err(ApiError(
                StatusCode::FORBIDDEN,
                "account suspended: ask the server's administrator".into(),
            ))
        }
        Err(_) => {
            let tried = body.token.as_deref().unwrap_or(&body.password);
            state.limiter.failed(&from, &body.username, tried);
            state
                .journal
                .refused("login.fail", &body.username, client, &from);
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
    state
        .journal
        .log(crate::journal::Entry::new("password.changed").user(&auth.user.username));
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
    state.journal.log(
        crate::journal::Entry::new("key.created")
            .user(&auth.user.username)
            .detail(body.name.trim()),
    );
    Ok(Json(json!({ "key": key, "info": info })))
}

async fn revoke_key(State(state): State<AppState>, auth: Auth, Path(id): Path<String>) -> Reply {
    if !state.users.revoke_api_key(&auth.user.id, &id).await? {
        return Err(ApiError(StatusCode::NOT_FOUND, "no such key".into()));
    }
    state
        .journal
        .log(crate::journal::Entry::new("key.revoked").user(&auth.user.username));
    Ok(Json(json!({})))
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
    state.journal.log(
        crate::journal::Entry::new("account.created")
            .by_admin(&auth.user.username)
            .target(&user.username)
            .detail(if user.is_admin { "admin" } else { "user" }),
    );
    Ok(Json(json!(user)))
}

async fn delete_user(State(state): State<AppState>, auth: Auth, Path(id): Path<String>) -> Reply {
    if !auth.user.is_admin {
        return Err(ApiError::forbidden());
    }
    let name = state.users.get(&id).await?.map(|u| u.username);
    match state.users.delete(&id).await {
        Ok(true) => {
            state.journal.log(
                crate::journal::Entry::new("account.deleted")
                    .by_admin(&auth.user.username)
                    .target(name.unwrap_or(id)),
            );
            Ok(Json(json!({})))
        }
        Ok(false) => Err(ApiError(StatusCode::NOT_FOUND, "no such user".into())),
        Err(e) => Err(ApiError::bad(e.to_string())),
    }
}

#[cfg(test)]
mod tests;
