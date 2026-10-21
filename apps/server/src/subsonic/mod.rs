//! Subsonic / OpenSubsonic API (`/rest/<endpoint>[.view]`).
//!
//! Parameters come from the query string or a form body (OpenSubsonic `formPost`). Every call is
//! authenticated with one of: `u` + `p` (password, or `enc:` + hex), `u` + `t` + `s` (legacy
//! token, see [`crate::users`]), or `apiKey` (OpenSubsonic). Answers are XML by default, JSON
//! with `f=json`, JSONP with `f=jsonp` + `callback`.

mod annotations;
mod browse;
pub(crate) mod media;
mod model;
mod online;
mod playlists;
mod queue;
mod search;
mod system;
mod xml;

pub use annotations::NowPlaying;
pub use model::iso_date;

use std::net::SocketAddr;

use axum::{
    Extension, Router,
    body::Bytes,
    extract::{ConnectInfo, Path, RawQuery, State},
    http::{HeaderMap, HeaderValue, header},
    response::{IntoResponse, Response},
    routing::any,
};
use serde_json::{Map, Value, json};

use crate::{
    server::AppState,
    users::{AuthError, User},
};

/// Subsonic API version implemented.
pub const API_VERSION: &str = "1.16.1";

/// Subsonic error codes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Code {
    Generic = 0,
    MissingParameter = 10,
    ClientTooOld = 20,
    ServerTooOld = 30,
    WrongCredentials = 40,
    TokenAuthNotSupported = 41,
    AuthMechanismNotSupported = 42,
    ConflictingAuth = 43,
    InvalidApiKey = 44,
    NotAuthorized = 50,
    TrialOver = 60,
    NotFound = 70,
}

#[derive(Debug)]
pub struct ApiError {
    pub code: Code,
    pub message: String,
}

impl ApiError {
    pub fn new(code: Code, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub fn missing(name: &str) -> Self {
        Self::new(
            Code::MissingParameter,
            format!("Required parameter is missing: {name}"),
        )
    }

    pub fn not_found(what: &str) -> Self {
        Self::new(Code::NotFound, format!("{what} not found"))
    }

    pub fn forbidden() -> Self {
        Self::new(
            Code::NotAuthorized,
            "The user is not authorized for the given operation",
        )
    }
}

impl From<anyhow::Error> for ApiError {
    fn from(e: anyhow::Error) -> Self {
        tracing::error!("subsonic: {e:#}");
        Self::new(Code::Generic, "Internal error")
    }
}

pub type Reply = Result<Map<String, Value>, ApiError>;

/// Request parameters, in order, repeated keys kept (`id=1&id=2`).
#[derive(Debug, Default)]
pub struct Params(Vec<(String, String)>);

impl Params {
    fn parse(query: Option<&str>, body: &[u8]) -> Self {
        let mut all = Vec::new();
        for part in [query.unwrap_or_default().as_bytes(), body] {
            all.extend(form_urlencoded(part));
        }
        Self(all)
    }

    pub fn get(&self, name: &str) -> Option<&str> {
        self.0
            .iter()
            .find(|(k, _)| k == name)
            .map(|(_, v)| v.as_str())
    }

    pub fn require(&self, name: &str) -> Result<&str, ApiError> {
        self.get(name)
            .filter(|v| !v.is_empty())
            .ok_or_else(|| ApiError::missing(name))
    }

    pub fn all(&self, name: &str) -> Vec<&str> {
        self.0
            .iter()
            .filter(|(k, _)| k == name)
            .map(|(_, v)| v.as_str())
            .collect()
    }

    pub fn has(&self, name: &str) -> bool {
        self.get(name).is_some()
    }
}

fn form_urlencoded(input: &[u8]) -> Vec<(String, String)> {
    fn decode(s: &[u8]) -> String {
        let mut out = Vec::with_capacity(s.len());
        let mut i = 0;
        while i < s.len() {
            match s[i] {
                b'+' => out.push(b' '),
                // `%XX`: needs two more bytes.
                b'%' if i + 2 < s.len() => {
                    match std::str::from_utf8(&s[i + 1..i + 3])
                        .ok()
                        .and_then(|h| u8::from_str_radix(h, 16).ok())
                    {
                        Some(b) => {
                            out.push(b);
                            i += 2;
                        }
                        None => out.push(b'%'),
                    }
                }
                b => out.push(b),
            }
            i += 1;
        }
        String::from_utf8_lossy(&out).into_owned()
    }
    input
        .split(|b| *b == b'&')
        .filter(|p| !p.is_empty())
        .map(|pair| match pair.iter().position(|b| *b == b'=') {
            Some(i) => (decode(&pair[..i]), decode(&pair[i + 1..])),
            None => (decode(pair), String::new()),
        })
        .collect()
}

/// What a handler gets.
pub struct Ctx {
    pub state: AppState,
    pub user: User,
    pub params: Params,
    pub headers: HeaderMap,
}

impl Ctx {
    /// What this user may do (administrators: everything).
    pub async fn limits(&self) -> crate::users::admin::Limits {
        self.state
            .users
            .limits(&self.user.id)
            .await
            .unwrap_or_else(|e| {
                tracing::error!("limits of {}: {e:#}", self.user.username);
                crate::users::admin::Limits::default()
            })
    }

    /// The bit rate to stream at: the client's wish, within the user's limit (kbit/s, 0 = any).
    pub async fn max_bit_rate(&self) -> i64 {
        let wanted: i64 = self
            .params
            .get("maxBitRate")
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);
        // The account's limit, and the server's for everyone (settings): the lower one.
        let server = self
            .state
            .settings_now
            .get("max_bit_rate")
            .and_then(serde_json::Value::as_i64)
            .filter(|n| *n > 0);
        let account = self.limits().await.max_bit_rate.map(i64::from);
        let cap = match (account, server) {
            (Some(a), Some(s)) => Some(a.min(s)),
            (a, s) => a.or(s),
        };
        match cap {
            Some(cap) if wanted <= 0 || wanted > cap => cap,
            _ => wanted,
        }
    }

    /// Tells the user's devices what changed (see [`crate::events`]).
    pub fn emit(&self, event: crate::events::Event) {
        let by = crate::events::device(&self.headers, self.params.get("device"));
        self.state.events.emit(&self.user.id, by.as_deref(), event);
    }
}

pub fn router() -> Router<AppState> {
    Router::new().route("/rest/{endpoint}", any(handle))
}

async fn handle(
    State(state): State<AppState>,
    Path(endpoint): Path<String>,
    peer: Option<Extension<ConnectInfo<SocketAddr>>>,
    headers: HeaderMap,
    RawQuery(query): RawQuery,
    body: Bytes,
) -> Response {
    let params = Params::parse(query.as_deref(), &body);
    let name = endpoint
        .strip_suffix(".view")
        .unwrap_or(&endpoint)
        .to_owned();
    let format = Format::from(&params);

    // Answered without credentials (OpenSubsonic).
    if name == "getOpenSubsonicExtensions" {
        return format.render(system::open_subsonic_extensions());
    }

    let addr = crate::server::client_addr(&headers, peer.map(|p| p.0.0));
    let user = match authenticate(&state, &params, &addr).await {
        Ok(u) => u,
        Err(e) => return format.render(Err(e)),
    };
    let ctx = Ctx {
        state,
        user,
        params,
        headers,
    };
    // Binary answers (audio, images); errors still in the Subsonic format.
    let media = match name.as_str() {
        "stream" => Some(media::stream(&ctx, false).await),
        "download" => Some(media::stream(&ctx, true).await),
        "getCoverArt" => Some(media::cover_art(&ctx).await),
        _ => None,
    };
    if let Some(result) = media {
        return result.unwrap_or_else(|e| format.render(Err(e)));
    }
    let reply = match name.as_str() {
        "ping" => Ok(Map::new()),
        "getLicense" => system::license(),
        "tokenInfo" => system::token_info(&ctx),
        "getUser" => system::get_user(&ctx).await,
        "getUsers" => system::get_users(&ctx).await,
        "createUser" => system::create_user(&ctx).await,
        "deleteUser" => system::delete_user(&ctx).await,
        "changePassword" => system::change_password(&ctx).await,
        "getMusicFolders" => system::music_folders(&ctx).await,
        "getArtists" => browse::get_artists(&ctx).await,
        "getIndexes" => browse::get_indexes(&ctx).await,
        "getArtist" => browse::get_artist(&ctx).await,
        "getAlbum" => browse::get_album(&ctx).await,
        "getSong" => browse::get_song(&ctx).await,
        "getMusicDirectory" => browse::get_music_directory(&ctx).await,
        "getGenres" => browse::get_genres(&ctx).await,
        "getAlbumList2" => browse::album_list(&ctx, "albumList2").await,
        "getAlbumList" => browse::album_list(&ctx, "albumList").await,
        "getRandomSongs" => browse::random_songs(&ctx).await,
        "getSongsByGenre" => browse::songs_by_genre(&ctx).await,
        "getStarred2" => browse::starred(&ctx, "starred2").await,
        "getStarred" => browse::starred(&ctx, "starred").await,
        "getTopSongs" => browse::top_songs(&ctx).await,
        "getSimilarSongs2" => browse::similar_songs(&ctx, "similarSongs2").await,
        "getSimilarSongs" => browse::similar_songs(&ctx, "similarSongs").await,
        "getArtistInfo2" => browse::artist_info(&ctx, "artistInfo2").await,
        "getArtistInfo" => browse::artist_info(&ctx, "artistInfo").await,
        "getAlbumInfo2" => browse::album_info(&ctx, "albumInfo").await,
        "getAlbumInfo" => browse::album_info(&ctx, "albumInfo").await,
        "getScanStatus" => browse::scan_status(&ctx).await,
        "startScan" => browse::start_scan(&ctx).await,
        "star" => annotations::star(&ctx, true).await,
        "unstar" => annotations::star(&ctx, false).await,
        "setRating" => annotations::set_rating(&ctx).await,
        "scrobble" => annotations::scrobble(&ctx).await,
        "getNowPlaying" => annotations::get_now_playing(&ctx).await,
        "savePlayQueue" => queue::save(&ctx, false).await,
        "savePlayQueueByIndex" => queue::save(&ctx, true).await,
        "getPlayQueue" => queue::get(&ctx, false).await,
        "getPlayQueueByIndex" => queue::get(&ctx, true).await,
        "search3" => search::search(&ctx, "searchResult3").await,
        "search2" => search::search(&ctx, "searchResult2").await,
        "getPlaylists" => playlists::get_playlists(&ctx).await,
        "getPlaylist" => playlists::get_playlist(&ctx).await,
        "createPlaylist" => playlists::create_playlist(&ctx).await,
        "updatePlaylist" => playlists::update_playlist(&ctx).await,
        "deletePlaylist" => playlists::delete_playlist(&ctx).await,
        "getLyricsBySongId" => media::lyrics_by_song_id(&ctx).await,
        "getLyrics" => media::lyrics(&ctx).await,
        "getInternetRadioStations" => Ok(one(
            "internetRadioStations",
            json!({ "internetRadioStation": [] }),
        )),
        _ => Err(ApiError::new(
            Code::Generic,
            format!("{name} is not implemented yet"),
        )),
    };
    format.render(reply)
}

async fn authenticate(state: &AppState, p: &Params, addr: &str) -> Result<User, ApiError> {
    let users = &state.users;
    if let Some(key) = p.get("apiKey") {
        if ["u", "p", "t", "s"].iter().any(|k| p.has(k)) {
            return Err(ApiError::new(
                Code::ConflictingAuth,
                "Multiple conflicting authentication mechanisms provided",
            ));
        }
        return match users.check_api_key(key).await? {
            Ok(u) => {
                state.journal.signed_in(&u.username, p.get("c"), addr);
                Ok(u)
            }
            Err(AuthError::Suspended) => Err(suspended()),
            Err(_) => {
                state.journal.refused("login.fail", "", p.get("c"), addr);
                Err(ApiError::new(Code::InvalidApiKey, "Invalid API key"))
            }
        };
    }
    let username = p.require("u")?;
    if !state.limiter.allowed(addr, username) {
        state
            .journal
            .refused("login.blocked", username, p.get("c"), addr);
        return Err(ApiError::new(
            Code::WrongCredentials,
            "Too many failed attempts, try again later",
        ));
    }
    let result = match (p.get("p"), p.get("t"), p.get("s")) {
        (Some(pass), _, _) => {
            let pass = match pass.strip_prefix("enc:") {
                Some(hex_pass) => hex::decode(hex_pass)
                    .ok()
                    .and_then(|b| String::from_utf8(b).ok())
                    .unwrap_or_default(),
                None => pass.to_owned(),
            };
            users.check_password(username, &pass).await?
        }
        (None, Some(token), Some(salt)) => users.check_token(username, token, salt).await?,
        _ => return Err(ApiError::missing("p or t+s")),
    };
    match result {
        Ok(user) => {
            state.limiter.succeeded(addr, username);
            state.journal.signed_in(&user.username, p.get("c"), addr);
            Ok(user)
        }
        Err(AuthError::TokenAuthUnavailable) => Err(ApiError::new(
            Code::TokenAuthNotSupported,
            "Token authentication is not available on this server: use apiKey",
        )),
        // The right password: not a guess, the limiter does not count it.
        Err(AuthError::Suspended) => {
            state
                .journal
                .refused("login.suspended", username, p.get("c"), addr);
            Err(suspended())
        }
        Err(_) => {
            state
                .journal
                .refused("login.fail", username, p.get("c"), addr);
            let tried = p.get("p").or(p.get("t")).unwrap_or_default();
            state.limiter.failed(addr, username, tried);
            Err(ApiError::new(
                Code::WrongCredentials,
                "Wrong username or password",
            ))
        }
    }
}

/// What a suspended account is told (its own credentials were right).
fn suspended() -> ApiError {
    ApiError::new(
        Code::NotAuthorized,
        "This account is suspended: ask the server's administrator",
    )
}

enum Format {
    Xml,
    Json,
    Jsonp(String),
}

impl Format {
    fn from(p: &Params) -> Self {
        match p.get("f") {
            Some("json") => Self::Json,
            Some("jsonp") => match p.get("callback").filter(|c| valid_callback(c)) {
                Some(cb) => Self::Jsonp(cb.to_owned()),
                None => Self::Json,
            },
            _ => Self::Xml,
        }
    }

    fn render(&self, reply: Reply) -> Response {
        let mut body = Map::new();
        body.insert(
            "status".into(),
            json!(if reply.is_ok() { "ok" } else { "failed" }),
        );
        body.insert("version".into(), json!(API_VERSION));
        body.insert("type".into(), json!("musonic"));
        body.insert("serverVersion".into(), json!(env!("CARGO_PKG_VERSION")));
        body.insert("openSubsonic".into(), json!(true));
        match reply {
            Ok(fields) => body.extend(fields),
            Err(e) => {
                body.insert(
                    "error".into(),
                    json!({ "code": e.code as i32, "message": e.message }),
                );
            }
        }
        let (content_type, text) = match self {
            Self::Xml => ("application/xml; charset=utf-8", xml::render(&body)),
            Self::Json => (
                "application/json; charset=utf-8",
                json!({ "subsonic-response": body }).to_string(),
            ),
            Self::Jsonp(cb) => (
                "application/javascript; charset=utf-8",
                format!("{cb}({});", json!({ "subsonic-response": body })),
            ),
        };
        (
            [(header::CONTENT_TYPE, HeaderValue::from_static(content_type))],
            text,
        )
            .into_response()
    }
}

fn valid_callback(cb: &str) -> bool {
    !cb.is_empty()
        && cb.len() <= 64
        && cb
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.')
}

/// Shared helper: `{"key": value}`.
pub fn one(key: &str, value: Value) -> Map<String, Value> {
    let mut m = Map::new();
    m.insert(key.into(), value);
    m
}

#[cfg(test)]
mod library_tests;
#[cfg(test)]
mod tests;
