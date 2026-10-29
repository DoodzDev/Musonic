//! HTTP server: `/health` (public liveness only), the Subsonic API (`/rest`) and the native
//! API (`/v1`).
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
use tower_http::{
    CompressionLevel,
    compression::{
        CompressionLayer,
        predicate::{Predicate, SizeAbove},
    },
    cors::{Any, CorsLayer},
};

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
    /// Rendered Subsonic answers, until the database changes.
    pub answers: Arc<crate::subsonic::AnswerCache>,
    /// The most asked of them, made again after a write.
    pub hot: Arc<crate::subsonic::Hot>,
    /// Ids of the tracks with a file present, until the library changes (random songs).
    pub present_tracks: Arc<crate::subsonic::Snapshot<Vec<String>>>,
    /// Ids of the albums with a file present, until the library changes (random albums).
    pub present_albums: Arc<crate::subsonic::Snapshot<Vec<String>>>,
    /// Genres and their counts, until the library changes.
    pub genres: Arc<crate::subsonic::Snapshot<Vec<serde_json::Value>>>,
    /// Album artists without the accounts' likes, sorted, until the library changes.
    pub library_artists: Arc<crate::subsonic::Snapshot<Vec<serde_json::Value>>>,
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
    /// The console's settings the server runs with ([`crate::settings`]).
    pub settings_now: Arc<std::collections::BTreeMap<String, serde_json::Value>>,
    /// Services playlists can be imported from (ADR-020).
    pub playlist_sources: Arc<Vec<Arc<dyn crate::playlist_import::PlaylistSource>>>,
    pub playlist_imports: crate::playlist_import::PlaylistImports,
    /// Podcast shows, episodes and the directory (ADR-023).
    pub podcasts: crate::podcasts::Podcasts,
}

impl AppState {
    pub fn new(db: Db, library: Option<LibraryService>, users: Users, data_dir: PathBuf) -> Self {
        let podcasts = crate::podcasts::Podcasts::new(db.clone()).expect("HTTP client");
        Self {
            podcasts,
            db,
            library,
            users,
            data_dir,
            limiter: Arc::new(AuthLimiter::default()),
            setup_lock: Arc::new(tokio::sync::Mutex::new(())),
            now_playing: Arc::default(),
            answers: Arc::default(),
            hot: Arc::default(),
            present_tracks: Arc::default(),
            present_albums: Arc::default(),
            library_artists: Arc::default(),
            genres: Arc::default(),
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
            settings_now: Arc::new(crate::settings::of(&crate::config::Config::default())),
            playlist_sources: Arc::default(),
            playlist_imports: Default::default(),
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
        .allow_headers([
            header::AUTHORIZATION,
            header::CONTENT_TYPE,
            header::RANGE,
            header::IF_NONE_MATCH,
        ])
        .expose_headers([
            header::CONTENT_RANGE,
            header::CONTENT_LENGTH,
            header::ACCEPT_RANGES,
            header::ETAG,
        ]);
    let admin = state
        .admin_dir
        .clone()
        .filter(|d| d.join("index.html").is_file());
    // Musonic Web, when installed from the console (read at each request: no restart needed).
    let web = crate::webapp::dir(&state.data_dir);
    let app = Router::new()
        .nest_service(
            "/app",
            tower_http::services::ServeDir::new(&web)
                .fallback(tower_http::services::ServeFile::new(web.join("index.html"))),
        )
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
    app.layer(compression()).layer(cors).with_state(state)
}

/// Text answers (Subsonic, `/v1`, the console's files) compressed for the clients that accept
/// it: a list of artists goes from about 100 KB to 15. Audio and pictures are sent as they are.
fn compression() -> CompressionLayer<impl Predicate> {
    let text = |_: axum::http::StatusCode,
                _: axum::http::Version,
                h: &HeaderMap,
                _: &axum::http::Extensions| {
        h.get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .is_some_and(|t| {
                t.starts_with("text/")
                    || t.starts_with("application/json")
                    || t.starts_with("application/xml")
                    || t.starts_with("application/javascript")
            })
    };
    CompressionLayer::new()
        .quality(CompressionLevel::Fastest)
        .compress_when(SizeAbove::new(1024).and(text))
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
        "server (for example <a href=\"https://musonic.doodz.dev/app/\">Musonic Web</a>).</p>",
        "<p>Version ",
        env!("CARGO_PKG_VERSION"),
        " · <a href=\"/health\">status</a></p>",
        "</main></body></html>"
    ))
}

/// Liveness check for anyone (Docker, uptime monitors): whether the server and its database
/// answer, nothing more. The detail would tell anyone which providers and imports this server
/// has, so it is for administrators: [`health_details`], at `GET /v1/admin/health`.
async fn health(State(state): State<AppState>) -> (axum::http::StatusCode, Json<Value>) {
    match state.db.version().await {
        Ok(_) => (axum::http::StatusCode::OK, Json(json!({ "status": "ok" }))),
        Err(_) => (
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "status": "degraded" })),
        ),
    }
}

/// The server's state in detail: version, schema, last scan, providers, alerts, imports.
pub async fn health_details(state: &AppState) -> Value {
    let schema = state.db.version().await.ok();
    let imports = state
        .db
        .call(|c| Ok(crate::library::import::counts(c)?))
        .await
        .ok();
    let alerts = state.provider_health.alerts();
    json!({
        "status": if schema.is_none() { "degraded" } else if alerts.is_empty() { "ok" } else { "warning" },
        "version": env!("CARGO_PKG_VERSION"),
        "schema": schema,
        "scan": state.library.as_ref().map(LibraryService::status),
        "providers": state.providers.iter().map(|p| p.id()).collect::<Vec<_>>(),
        "alerts": alerts,
        "imports": imports,
    })
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
        assert!(get("/health").await.1.contains("\"ok\""));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn public_health_says_only_whether_the_server_answers() {
        let app = router(state());
        let res = app
            .oneshot(Request::get("/health").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(res.status(), 200);
        let body: Value =
            serde_json::from_slice(&res.into_body().collect().await.unwrap().to_bytes()).unwrap();
        assert_eq!(
            body,
            json!({ "status": "ok" }),
            "no providers, imports or version"
        );
    }

    #[tokio::test]
    async fn health_details_report_version_and_schema() {
        let body = health_details(&state()).await;
        assert_eq!(body["status"], "ok");
        assert_eq!(body["schema"], crate::db::SCHEMA_VERSION);
        assert!(body["providers"].is_array());
    }
}
