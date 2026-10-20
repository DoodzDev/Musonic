//! HTTP server: `/health`, the Subsonic API (`/rest`) and the native API (`/v1`).
//!
//! CORS is open (any origin, no cookies): browsers clients such as Musonic Web call the server
//! from another address, with credentials in parameters or an `Authorization` header.

use std::{net::SocketAddr, path::PathBuf, sync::Arc};

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
    /// Caches (resized covers…) live under it.
    pub data_dir: PathBuf,
    /// What each user plays now (Subsonic `getNowPlaying`).
    pub now_playing: Arc<crate::subsonic::NowPlaying>,
    /// Online catalog, when enabled.
    pub online: Option<Arc<crate::online::Deezer>>,
    /// Where audio comes from for tracks without a file, tried in order.
    pub providers: Arc<Vec<Arc<dyn crate::providers::AudioProvider>>>,
    /// Their streams, cached on disk and shared by every listener.
    pub sessions: Arc<crate::stream::SessionManager>,
    /// Their last problems (expired credentials…).
    pub provider_health: Arc<crate::providers::ProviderHealth>,
    /// Background imports, when a library and a provider whose files may be imported exist.
    pub imports: Option<crate::library::import::ImportService>,
    /// Real-time events to the devices of each account.
    pub events: crate::events::Events,
    /// The built administration console (`index.html` and its files), when installed.
    pub admin_dir: Option<PathBuf>,
    pub music_dir: Option<PathBuf>,
    /// Folder of the imports, inside the music folder.
    pub import_dir: String,
    /// Live measures for the console.
    pub metrics: Option<Arc<crate::metrics::Metrics>>,
    /// What happened, for the console (`events.db`).
    pub journal: crate::journal::Journal,
}

impl AppState {
    pub fn new(db: Db, library: Option<LibraryService>, users: Users, data_dir: PathBuf) -> Self {
        Self {
            db,
            library,
            users,
            data_dir,
            limiter: Arc::new(AuthLimiter::default()),
            setup_lock: Arc::new(tokio::sync::Mutex::new(())),
            now_playing: Arc::default(),
            online: None,
            providers: Arc::default(),
            sessions: Arc::default(),
            provider_health: Arc::default(),
            imports: None,
            events: Default::default(),
            admin_dir: None,
            music_dir: None,
            import_dir: "Musonic".to_owned(),
            metrics: None,
            journal: crate::journal::Journal::memory(),
        }
    }
}

impl AppState {
    /// What opening provider streams needs.
    pub fn remote(&self) -> crate::remote::Remote {
        crate::remote::Remote {
            db: self.db.clone(),
            providers: self.providers.clone(),
            sessions: self.sessions.clone(),
            health: self.provider_health.clone(),
            tmp: self.data_dir.join("tmp").join("streams"),
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
            Method::PATCH,
            Method::DELETE,
        ])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE, header::RANGE])
        .expose_headers([
            header::CONTENT_RANGE,
            header::CONTENT_LENGTH,
            header::ACCEPT_RANGES,
        ]);
    let admin = state
        .admin_dir
        .clone()
        .filter(|d| d.join("index.html").is_file());
    let app = Router::new()
        .route("/health", get(health))
        .merge(subsonic::router())
        .merge(api::router());
    // The administration console at the server's address; any other path opens it too (its
    // own pages: /accounts, /invite/…). Without it, a page says how to use the server.
    let app = match admin {
        Some(dir) => app
            .route("/v1/{*rest}", axum::routing::any(api_not_found))
            .fallback_service(
                tower_http::services::ServeDir::new(&dir)
                    .fallback(tower_http::services::ServeFile::new(dir.join("index.html"))),
            ),
        None => app.route("/", get(home)),
    };
    app.layer(cors).with_state(state)
}

async fn api_not_found() -> (axum::http::StatusCode, Json<Value>) {
    (
        axum::http::StatusCode::NOT_FOUND,
        Json(json!({ "error": "no such route" })),
    )
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
    let imports = state
        .db
        .call(|c| Ok(crate::library::import::counts(c)?))
        .await
        .ok();
    let alerts = state.provider_health.alerts();
    Json(json!({
        "status": if schema.is_none() { "degraded" } else if alerts.is_empty() { "ok" } else { "warning" },
        "version": env!("CARGO_PKG_VERSION"),
        "schema": schema,
        "scan": state.library.as_ref().map(LibraryService::status),
        "providers": state.providers.iter().map(|p| p.id()).collect::<Vec<_>>(),
        "alerts": alerts,
        "imports": imports,
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
        AppState::new(
            db,
            None,
            users,
            std::env::temp_dir().join("musonic-test-data"),
        )
    }

    #[tokio::test]
    async fn the_console_is_served_at_the_servers_address() {
        let dir = crate::testing::temp_dir("console");
        std::fs::create_dir_all(dir.join("assets")).unwrap();
        std::fs::write(
            dir.join("index.html"),
            "<!doctype html><title>Console</title>",
        )
        .unwrap();
        std::fs::write(dir.join("assets/app.js"), "console.log(1)").unwrap();
        let mut st = state();
        st.admin_dir = Some(dir.clone());
        let app = router(st);
        let get = async |uri: &str| {
            let res = app
                .clone()
                .oneshot(Request::get(uri).body(Body::empty()).unwrap())
                .await
                .unwrap();
            let status = res.status();
            let body = res.into_body().collect().await.unwrap().to_bytes();
            (status, String::from_utf8_lossy(&body).into_owned())
        };
        assert!(get("/").await.1.contains("Console"));
        assert!(
            get("/accounts/abc").await.1.contains("Console"),
            "its own pages"
        );
        assert!(get("/invite/token").await.1.contains("Console"));
        assert_eq!(get("/assets/app.js").await.1, "console.log(1)");
        let (status, body) = get("/v1/nope").await;
        assert_eq!(status, 404);
        assert!(body.contains("error"), "the API keeps JSON errors");
        assert!(get("/health").await.1.contains("schema"));
        let _ = std::fs::remove_dir_all(&dir);
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
