//! Scrobbling routes: each account connects its ListenBrainz and Last.fm accounts
//! (`/v1/me/scrobbling…`); Last.fm's sign-in page comes back to
//! `/v1/scrobbling/lastfm/callback`; an administrator sets the Last.fm application
//! (`/v1/admin/scrobbling/lastfm`). Tokens and keys are never sent back.
use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    response::{Html, IntoResponse, Response},
    routing::{delete, get, post, put},
};
use serde::Deserialize;
use serde_json::json;

use super::{ApiError, Auth, Reply};
use crate::{journal::Entry, scrobbling::SERVICES, server::AppState};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/v1/me/scrobbling", get(status))
        .route("/v1/me/scrobbling/listenbrainz", put(connect_listenbrainz))
        .route("/v1/me/scrobbling/lastfm", post(start_lastfm))
        .route("/v1/me/scrobbling/{service}", delete(disconnect))
        .route("/v1/scrobbling/lastfm/callback", get(lastfm_callback))
        .route(
            "/v1/admin/scrobbling/lastfm",
            get(lastfm_app).put(set_lastfm_app),
        )
}

async fn status(State(state): State<AppState>, auth: Auth) -> Reply {
    Ok(Json(state.scrobbling.status(&auth.user.id).await?))
}

#[derive(Deserialize)]
struct Token {
    token: String,
}

async fn connect_listenbrainz(
    State(state): State<AppState>,
    auth: Auth,
    Json(body): Json<Token>,
) -> Reply {
    match state
        .scrobbling
        .connect_listenbrainz(&auth.user.id, &body.token)
        .await
    {
        Ok(_) => Ok(Json(state.scrobbling.status(&auth.user.id).await?)),
        Err(e) => Err(ApiError(StatusCode::UNPROCESSABLE_ENTITY, e.to_string())),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Start {
    /// The server's address as the app uses it (`https://music.example.com`): Last.fm sends
    /// the browser back there.
    server_url: String,
}

async fn start_lastfm(State(state): State<AppState>, auth: Auth, Json(body): Json<Start>) -> Reply {
    let base = reqwest::Url::parse(body.server_url.trim())
        .ok()
        .filter(|u| matches!(u.scheme(), "http" | "https") && u.host().is_some())
        .ok_or_else(|| ApiError::bad("serverUrl must be the server's http(s) address"))?;
    let callback = format!(
        "{}/v1/scrobbling/lastfm/callback",
        base.as_str().trim_end_matches('/')
    );
    match state.scrobbling.lastfm_start(&auth.user.id, &callback) {
        Ok(url) => Ok(Json(json!({ "url": url }))),
        Err(e) => Err(ApiError(StatusCode::CONFLICT, e.to_string())),
    }
}

async fn disconnect(
    State(state): State<AppState>,
    auth: Auth,
    Path(service): Path<String>,
) -> Reply {
    if !SERVICES.contains(&service.as_str()) {
        return Err(ApiError(StatusCode::NOT_FOUND, "no such service".into()));
    }
    state.scrobbling.disconnect(&auth.user.id, &service).await?;
    Ok(Json(state.scrobbling.status(&auth.user.id).await?))
}

#[derive(Deserialize)]
struct Callback {
    state: String,
    token: Option<String>,
}

/// A small page for the browser Last.fm sent back: it says what happened, nothing more.
fn page(title: &str, text: &str) -> Response {
    let esc = |s: &str| {
        s.replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
    };
    Html(format!(
        "<!doctype html><html><head><meta charset=\"utf-8\">\
         <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\
         <meta name=\"referrer\" content=\"no-referrer\"><title>Musonic</title>\
         <style>body{{font:16px/1.5 system-ui,sans-serif;margin:0;min-height:100vh;display:grid;\
         place-items:center;background:#0f0f12;color:#e8e8ec}}main{{max-width:30rem;padding:2rem;\
         text-align:center}}h1{{font-size:1.4rem}}p{{color:#a0a0aa}}</style></head>\
         <body><main><h1>{}</h1><p>{}</p></main></body></html>",
        esc(title),
        esc(text)
    ))
    .into_response()
}

async fn lastfm_callback(State(state): State<AppState>, Query(q): Query<Callback>) -> Response {
    let Some(token) = q.token.filter(|t| !t.is_empty()) else {
        return page(
            "Last.fm not connected",
            "Last.fm did not allow Musonic. You can close this page.",
        );
    };
    match state.scrobbling.lastfm_finish(&q.state, &token).await {
        Ok(name) => page(
            "Last.fm connected",
            &format!(
                "Your plays now go to the Last.fm account {name}. You can close this page and go back to Musonic."
            ),
        ),
        Err(e) => page("Last.fm not connected", &e.to_string()),
    }
}

fn admin(auth: &Auth) -> Result<(), ApiError> {
    if auth.user.is_admin {
        Ok(())
    } else {
        Err(ApiError::forbidden())
    }
}

async fn lastfm_app(State(state): State<AppState>, auth: Auth) -> Reply {
    admin(&auth)?;
    Ok(Json(
        json!({ "lastfmConfigured": state.scrobbling.lastfm_ready() }),
    ))
}

#[derive(Deserialize)]
struct LastfmApp {
    key: String,
    #[serde(default)]
    secret: String,
}

async fn set_lastfm_app(
    State(state): State<AppState>,
    auth: Auth,
    Json(body): Json<LastfmApp>,
) -> Reply {
    admin(&auth)?;
    if let Err(e) = state
        .scrobbling
        .set_lastfm_app(&body.key, &body.secret)
        .await
    {
        return Err(ApiError(StatusCode::UNPROCESSABLE_ENTITY, e.to_string()));
    }
    state
        .journal
        .log(Entry::new("scrobbling.lastfm_app").by_admin(&auth.user.username));
    Ok(Json(
        json!({ "lastfmConfigured": state.scrobbling.lastfm_ready() }),
    ))
}
