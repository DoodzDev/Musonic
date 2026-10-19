//! HTTP server: `/health`, the Subsonic API (`/rest`) and the native API (`/v1`).
//!
//! CORS is open (any origin, no cookies): browsers clients such as Musonic Web call the server
//! from another address, with credentials in parameters or an `Authorization` header.

use std::{net::SocketAddr, sync::Arc};

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, Method, header},
    response::Html,
    routing::get,
};
use serde_json::{Value, json};
use tower_http::cors::{Any, CorsLayer};

use crate::{
    api,
    db::Db,
    library::LibraryService,
    subsonic,
    users::{Users, limiter::AuthLimiter},
};

#[derive(Clone)]
pub struct AppState {
    pub db: Db,
    pub library: Option<LibraryService>,
    pub users: Users,
    pub limiter: Arc<AuthLimiter>,
    /// One first-account setup at a time.
    pub setup_lock: Arc<tokio::sync::Mutex<()>>,
}

impl AppState {
    pub fn new(db: Db, library: Option<LibraryService>, users: Users) -> Self {
        Self {
            db,
            library,
            users,
            limiter: Arc::new(AuthLimiter::default()),
            setup_lock: Arc::new(tokio::sync::Mutex::new(())),
        }
    }
}

pub fn router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([
            Method::GET,
            Method::HEAD,
            Method::POST,
            Method::PUT,
            Method::DELETE,
        ])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE, header::RANGE])
        .expose_headers([
            header::CONTENT_RANGE,
            header::CONTENT_LENGTH,
            header::ACCEPT_RANGES,
        ]);
    Router::new()
        .route("/", get(home))
        .route("/health", get(health))
        .merge(subsonic::router())
        .merge(api::router())
        .layer(cors)
        .with_state(state)
}

/// Client address, for the sign-in limiter: the address forwarded by the proxy in front
/// (Cloudflare, Nginx…) when there is one, else the connection's.
pub fn client_addr(headers: &HeaderMap, peer: Option<SocketAddr>) -> String {
    headers
        .get("cf-connecting-ip")
        .or_else(|| headers.get("x-forwarded-for"))
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(',').next())
        .map(|v| v.trim().to_owned())
        .or_else(|| peer.map(|p| p.ip().to_string()))
        .unwrap_or_default()
}

/// Until the web client is served here: a page saying the server runs and how to use it.
async fn home() -> Html<&'static str> {
    Html(concat!(
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">",
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
        "<title>Musonic Server</title><style>",
        "body{font:16px/1.5 system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;",
        "background:#0f0f12;color:#e8e8ec}main{max-width:32rem;padding:2rem}h1{font-size:1.5rem;margin:0 0 .5rem}",
        "p{color:#a0a0aa}code{color:#e8e8ec}a{color:#e8e8ec}</style></head><body><main>",
        "<h1>Musonic Server is running</h1>",
        "<p>Sign in from a Musonic app or any Subsonic client, with this page's address as the ",
        "server (for example <a href=\"https://doodzprog.github.io/Musonic/app/\">Musonic Web</a>).</p>",
        "<p>Version ",
        env!("CARGO_PKG_VERSION"),
        " · <a href=\"/health\">status</a></p>",
        "</main></body></html>"
    ))
}

async fn health(State(state): State<AppState>) -> Json<Value> {
    let schema = state.db.version().await.ok();
    Json(json!({
        "status": if schema.is_some() { "ok" } else { "degraded" },
        "version": env!("CARGO_PKG_VERSION"),
        "schema": schema,
        "scan": state.library.as_ref().map(LibraryService::status),
    }))
}

#[cfg(test)]
pub mod tests {
    use axum::{body::Body, http::Request};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    use super::*;
    use crate::users::secret::SecretBox;

    pub fn state() -> AppState {
        let db = Db::memory().unwrap();
        let users = Users::new(db.clone(), SecretBox::from_key(&[3; 32]), true);
        AppState::new(db, None, users)
    }

    #[tokio::test]
    async fn health_reports_version_and_schema() {
        let app = router(state());
        let res = app
            .oneshot(Request::get("/health").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(res.status(), 200);
        let body: Value =
            serde_json::from_slice(&res.into_body().collect().await.unwrap().to_bytes()).unwrap();
        assert_eq!(body["status"], "ok");
        assert_eq!(body["schema"], crate::db::SCHEMA_VERSION);
    }
}
