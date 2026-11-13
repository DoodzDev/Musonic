//! Scrobbling to ListenBrainz and Last.fm: each account connects its own accounts (a
//! ListenBrainz token, a Last.fm session from Last.fm's sign-in page) and its plays go out in
//! the background. A play is first written to the local history (`scrobble`), and in the same
//! transaction to an outbox, with what the services need copied in; a worker sends the outbox,
//! by batches, and tries again later when a service is down. A refused token stops the sending
//! for that account until it reconnects; plays keep waiting. "Now playing" is sent once, with no
//! retry. Last.fm needs an application key and secret, set by an administrator.
use std::{
    collections::HashMap,
    sync::{Mutex, RwLock},
    time::{Duration, Instant},
};

use anyhow::{Context, anyhow};
use md5::{Digest, Md5};
use rusqlite::{OptionalExtension, Transaction, params};
use serde_json::{Value, json};

use crate::{db::Db, users::Users};

pub const LISTENBRAINZ_URL: &str = "https://api.listenbrainz.org";
pub const LASTFM_API_URL: &str = "https://ws.audioscrobbler.com/2.0/";
pub const LASTFM_AUTH_URL: &str = "https://www.last.fm/api/auth/";

const LASTFM_KEY: &str = "lastfm_api_key";
const LASTFM_SECRET: &str = "lastfm_api_secret";
/// Plays per request: Last.fm takes 50 at most.
const BATCH: usize = 50;
/// Given up after this many failed tries (about a week with the backoff).
const MAX_ATTEMPTS: i64 = 40;
/// Last.fm refuses plays older than 14 days.
const LASTFM_MAX_AGE: i64 = 14 * 86_400;
/// A Last.fm sign-in started here must come back within this time.
const STATE_TTL: Duration = Duration::from_secs(15 * 60);

pub const SERVICES: [&str; 2] = ["listenbrainz", "lastfm"];

/// Why a sending failed.
#[derive(Debug)]
enum SendError {
    /// The account's token or session is refused: stop until it reconnects.
    Refused(String),
    /// The service is down, slow or limiting: try again later.
    Later(String),
    /// The service will never take these plays (bad data): drop them.
    Rejected(String),
}

/// One play waiting to go out.
#[derive(Debug, Clone)]
struct Play {
    id: i64,
    played_at: i64,
    artist: String,
    title: String,
    album: String,
    duration_ms: i64,
    track_no: Option<i64>,
    mbid: Option<String>,
    isrc: Option<String>,
    attempts: i64,
}

/// Service, name on it, problem, last sent, plays waiting.
type AccountRow = (String, String, Option<String>, Option<i64>, i64);

pub struct Scrobbling {
    db: Db,
    users: Users,
    http: reqwest::Client,
    listenbrainz: String,
    lastfm_api: String,
    lastfm_auth: String,
    /// Last.fm application key and secret, set from the console.
    lastfm_app: RwLock<Option<(String, String)>>,
    /// Last.fm sign-ins under way: state → (account, started at).
    pending: Mutex<HashMap<String, (String, Instant)>>,
    wake: tokio::sync::Notify,
}

/// Copies a play into the outbox of each connected account of `user` (inside the play's
/// transaction, so a play is never sent twice nor lost).
pub fn enqueue(tx: &Transaction, user: &str, track: &str, at: i64) -> rusqlite::Result<usize> {
    tx.prepare_cached(
        "INSERT OR IGNORE INTO scrobble_outbox
             (user_id, service, played_at, artist, title, album, duration_ms, track_no, mbid, isrc)
         SELECT a.user_id, a.service, ?3, t.artist_display, t.title, coalesce(al.title, ''),
                t.duration_ms, t.track_number, t.mbid, t.isrc
           FROM scrobble_account a
           JOIN track t ON t.id = ?2
           LEFT JOIN album al ON al.id = t.album_id
          WHERE a.user_id = ?1 AND t.artist_display != '' AND t.title != ''",
    )?
    .execute(params![user, track, at])
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or_default()
}

/// Seconds before the next try: 1 min, 2, 4… up to 6 hours.
fn backoff(attempts: i64) -> i64 {
    (60_i64 << attempts.clamp(0, 9)).min(6 * 3600)
}

/// Last.fm's request signature: every parameter but `format`, sorted, then the secret, md5.
fn lastfm_sig(params: &[(&str, String)], secret: &str) -> String {
    let mut sorted: Vec<&(&str, String)> = params.iter().filter(|(k, _)| *k != "format").collect();
    sorted.sort_by(|a, b| a.0.cmp(b.0));
    let mut text = String::new();
    for (k, v) in sorted {
        text.push_str(k);
        text.push_str(v);
    }
    text.push_str(secret);
    hex::encode(Md5::digest(text.as_bytes()))
}

impl Scrobbling {
    pub fn new(db: Db, users: Users) -> anyhow::Result<Self> {
        Self::with_urls(db, users, LISTENBRAINZ_URL, LASTFM_API_URL, LASTFM_AUTH_URL)
    }

    pub fn with_urls(
        db: Db,
        users: Users,
        listenbrainz: &str,
        lastfm_api: &str,
        lastfm_auth: &str,
    ) -> anyhow::Result<Self> {
        Ok(Self {
            db,
            users,
            http: reqwest::Client::builder()
                .timeout(Duration::from_secs(20))
                .user_agent(concat!("Musonic/", env!("CARGO_PKG_VERSION")))
                .build()?,
            listenbrainz: listenbrainz.trim_end_matches('/').to_owned(),
            lastfm_api: lastfm_api.to_owned(),
            lastfm_auth: lastfm_auth.to_owned(),
            lastfm_app: RwLock::new(None),
            pending: Mutex::default(),
            wake: tokio::sync::Notify::new(),
        })
    }

    /// New plays are waiting: send them now rather than at the next round.
    pub fn wake(&self) {
        self.wake.notify_one();
    }

    /// Sends the outbox in the background, until the server stops.
    pub fn start(self: std::sync::Arc<Self>) {
        tokio::spawn(async move {
            loop {
                if let Err(e) = self.send_due().await {
                    tracing::warn!("scrobbling: {e:#}");
                }
                tokio::select! {
                    () = self.wake.notified() => {}
                    () = tokio::time::sleep(Duration::from_secs(60)) => {}
                }
            }
        });
    }

    // Accounts -------------------------------------------------------------------------------

    /// What a user sees: each service, connected or not, its name, its problem, what waits.
    pub async fn status(&self, user: &str) -> anyhow::Result<Value> {
        let user = user.to_owned();
        let lastfm_ready = self.lastfm_app.read().unwrap().is_some();
        let rows: Vec<AccountRow> = self
            .db
            .call(move |c| {
                Ok(c.prepare(
                    "SELECT a.service, a.name, a.problem, a.sent_at,
                            (SELECT count(*) FROM scrobble_outbox o
                              WHERE o.user_id = a.user_id AND o.service = a.service)
                       FROM scrobble_account a WHERE a.user_id = ?1",
                )?
                .query_map([&user], |r| {
                    Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
                })?
                .collect::<rusqlite::Result<_>>()?)
            })
            .await?;
        let mut out = serde_json::Map::new();
        for service in SERVICES {
            let row = rows.iter().find(|r| r.0 == service);
            let mut v = json!({
                "connected": row.is_some(),
                "name": row.map(|r| r.1.clone()),
                "problem": row.and_then(|r| r.2.clone()),
                "sentAt": row.and_then(|r| r.3),
                "pending": row.map_or(0, |r| r.4),
            });
            if service == "lastfm" {
                v["available"] = json!(lastfm_ready);
            }
            out.insert(service.to_owned(), v);
        }
        Ok(Value::Object(out))
    }

    /// Checks a ListenBrainz token with the service, then keeps it.
    pub async fn connect_listenbrainz(&self, user: &str, token: &str) -> anyhow::Result<String> {
        let token = token.trim();
        if token.is_empty() {
            return Err(anyhow!("the token is empty"));
        }
        let res = self
            .http
            .get(format!("{}/1/validate-token", self.listenbrainz))
            .header("authorization", format!("Token {token}"))
            .send()
            .await
            .context("ListenBrainz unreachable")?;
        let body: Value = res.json().await.context("ListenBrainz answered oddly")?;
        if body["valid"] != true {
            return Err(anyhow!("ListenBrainz refused this token"));
        }
        let name = body["user_name"].as_str().unwrap_or_default().to_owned();
        self.save_account(user, "listenbrainz", &name, token)
            .await?;
        Ok(name)
    }

    async fn save_account(
        &self,
        user: &str,
        service: &str,
        name: &str,
        secret: &str,
    ) -> anyhow::Result<()> {
        let sealed = self.users.seal(secret)?;
        let (user, service, name) = (user.to_owned(), service.to_owned(), name.to_owned());
        self.db
            .call(move |c| {
                c.execute(
                    "INSERT INTO scrobble_account(user_id, service, name, secret) VALUES (?1, ?2, ?3, ?4)
                     ON CONFLICT(user_id, service) DO UPDATE SET
                         name = excluded.name, secret = excluded.secret, problem = NULL",
                    params![user, service, name, sealed],
                )?;
                Ok(())
            })
            .await?;
        self.wake();
        Ok(())
    }

    /// Forgets the account and the plays still waiting for it.
    pub async fn disconnect(&self, user: &str, service: &str) -> anyhow::Result<()> {
        let (user, service) = (user.to_owned(), service.to_owned());
        self.db
            .call(move |c| {
                c.execute(
                    "DELETE FROM scrobble_account WHERE user_id = ?1 AND service = ?2",
                    [&user, &service],
                )?;
                c.execute(
                    "DELETE FROM scrobble_outbox WHERE user_id = ?1 AND service = ?2",
                    [&user, &service],
                )?;
                Ok(())
            })
            .await
    }

    // Last.fm application and sign-in ---------------------------------------------------------

    pub fn lastfm_ready(&self) -> bool {
        self.lastfm_app.read().unwrap().is_some()
    }

    /// At start: the key and secret last set from the console.
    pub async fn load_lastfm_app(&self) {
        let saved: Option<(String, String)> = self
            .db
            .call(|c| {
                let get = |k: &str| -> rusqlite::Result<Option<String>> {
                    c.query_row("SELECT value FROM property WHERE key = ?1", [k], |r| {
                        r.get(0)
                    })
                    .optional()
                };
                Ok(get(LASTFM_KEY)?.zip(get(LASTFM_SECRET)?))
            })
            .await
            .ok()
            .flatten();
        let app = saved.and_then(|(key, sealed)| Some((key, self.users.unseal(&sealed).ok()?)));
        *self.lastfm_app.write().unwrap() = app;
    }

    /// Sets the Last.fm application after a test request; an empty key removes it.
    pub async fn set_lastfm_app(&self, key: &str, secret: &str) -> anyhow::Result<()> {
        let (key, secret) = (key.trim().to_owned(), secret.trim().to_owned());
        if key.is_empty() {
            self.db
                .call(|c| {
                    c.execute(
                        "DELETE FROM property WHERE key IN (?1, ?2)",
                        [LASTFM_KEY, LASTFM_SECRET],
                    )?;
                    Ok(())
                })
                .await?;
            *self.lastfm_app.write().unwrap() = None;
            return Ok(());
        }
        // A signed request only a right key and secret pass.
        self.lastfm_call(&key, &secret, "auth.getToken", vec![])
            .await
            .map_err(|e| anyhow!("Last.fm refused this key and secret ({e:?})"))?;
        let sealed = self.users.seal(&secret)?;
        let stored = key.clone();
        self.db
            .call(move |c| {
                let set = "INSERT INTO property(key, value) VALUES (?1, ?2)
                           ON CONFLICT(key) DO UPDATE SET value = excluded.value";
                c.execute(set, [LASTFM_KEY, stored.as_str()])?;
                c.execute(set, [LASTFM_SECRET, sealed.as_str()])?;
                Ok(())
            })
            .await?;
        *self.lastfm_app.write().unwrap() = Some((key, secret));
        Ok(())
    }

    /// The Last.fm page where the user allows Musonic; it comes back to `callback` (this
    /// server's `/v1/scrobbling/lastfm/callback`) with a token.
    pub fn lastfm_start(&self, user: &str, callback: &str) -> anyhow::Result<String> {
        let Some((key, _)) = self.lastfm_app.read().unwrap().clone() else {
            return Err(anyhow!("Last.fm is not set up on this server"));
        };
        let state = hex::encode(rand::random::<[u8; 16]>());
        {
            let mut pending = self.pending.lock().unwrap();
            pending.retain(|_, (_, at)| at.elapsed() < STATE_TTL);
            pending.insert(state.clone(), (user.to_owned(), Instant::now()));
        }
        let cb = format!("{callback}?state={state}");
        let mut url = reqwest::Url::parse(&self.lastfm_auth)?;
        url.query_pairs_mut()
            .append_pair("api_key", &key)
            .append_pair("cb", &cb);
        Ok(url.into())
    }

    /// Back from Last.fm: trades the token for a session and keeps it. Returns the account's
    /// name on Last.fm.
    pub async fn lastfm_finish(&self, state: &str, token: &str) -> anyhow::Result<String> {
        let user = {
            let mut pending = self.pending.lock().unwrap();
            pending
                .remove(state)
                .filter(|(_, at)| at.elapsed() < STATE_TTL)
                .map(|(u, _)| u)
        }
        .ok_or_else(|| anyhow!("this sign-in expired: start again from Musonic"))?;
        let Some((key, secret)) = self.lastfm_app.read().unwrap().clone() else {
            return Err(anyhow!("Last.fm is not set up on this server"));
        };
        let body = self
            .lastfm_call(
                &key,
                &secret,
                "auth.getSession",
                vec![("token", token.to_owned())],
            )
            .await
            .map_err(|e| anyhow!("Last.fm refused the sign-in ({e:?})"))?;
        let session = body["session"]["key"]
            .as_str()
            .ok_or_else(|| anyhow!("no session"))?;
        let name = body["session"]["name"]
            .as_str()
            .unwrap_or_default()
            .to_owned();
        self.save_account(&user, "lastfm", &name, session).await?;
        Ok(name)
    }

    /// A signed Last.fm API call (POST, JSON answer).
    async fn lastfm_call(
        &self,
        key: &str,
        secret: &str,
        method: &str,
        mut params: Vec<(&str, String)>,
    ) -> Result<Value, SendError> {
        params.push(("api_key", key.to_owned()));
        params.push(("method", method.to_owned()));
        let sig = lastfm_sig(&params, secret);
        params.push(("api_sig", sig));
        params.push(("format", "json".to_owned()));
        let res = self
            .http
            .post(&self.lastfm_api)
            .form(&params)
            .send()
            .await
            .map_err(|e| SendError::Later(format!("unreachable: {e}")))?;
        let status = res.status();
        let body: Value = res.json().await.unwrap_or(Value::Null);
        if let Some(code) = body["error"].as_i64() {
            let msg = body["message"].as_str().unwrap_or_default().to_owned();
            // 4 auth failed, 9 bad session, 10 bad key, 14/15 token, 26 suspended key.
            return Err(match code {
                4 | 9 | 10 | 14 | 15 | 26 => SendError::Refused(msg),
                6 | 7 => SendError::Rejected(msg),
                _ => SendError::Later(msg),
            });
        }
        if !status.is_success() {
            return Err(SendError::Later(format!("HTTP {status}")));
        }
        Ok(body)
    }

    // Sending ----------------------------------------------------------------------------------

    /// "Now playing" on the connected services, once, in the background.
    pub fn now_playing(self: &std::sync::Arc<Self>, user: &str, track: &str) {
        let this = self.clone();
        let (user, track) = (user.to_owned(), track.to_owned());
        tokio::spawn(async move {
            let found = this
                .db
                .call(move |c| {
                    let play = c
                        .query_row(
                            "SELECT t.artist_display, t.title, coalesce(al.title, ''), t.duration_ms,
                                    t.track_number, t.mbid, t.isrc
                               FROM track t LEFT JOIN album al ON al.id = t.album_id WHERE t.id = ?1",
                            [&track],
                            |r| {
                                Ok(Play {
                                    id: 0,
                                    played_at: now(),
                                    artist: r.get(0)?,
                                    title: r.get(1)?,
                                    album: r.get(2)?,
                                    duration_ms: r.get(3)?,
                                    track_no: r.get(4)?,
                                    mbid: r.get(5)?,
                                    isrc: r.get(6)?,
                                    attempts: 0,
                                })
                            },
                        )
                        .optional()?;
                    let accounts: Vec<(String, String)> = c
                        .prepare(
                            "SELECT service, secret FROM scrobble_account
                              WHERE user_id = ?1 AND problem IS NULL",
                        )?
                        .query_map([&user], |r| Ok((r.get(0)?, r.get(1)?)))?
                        .collect::<rusqlite::Result<_>>()?;
                    Ok(play.map(|p| (p, accounts)))
                })
                .await;
            let Ok(Some((play, accounts))) = found else {
                return;
            };
            if play.artist.is_empty() || play.title.is_empty() {
                return;
            }
            for (service, sealed) in accounts {
                let Ok(secret) = this.users.unseal(&sealed) else {
                    continue;
                };
                let sent = match service.as_str() {
                    "listenbrainz" => {
                        this.listenbrainz_send(&secret, "playing_now", std::slice::from_ref(&play))
                            .await
                    }
                    "lastfm" => this.lastfm_now_playing(&secret, &play).await,
                    _ => Ok(()),
                };
                if let Err(e) = sent {
                    tracing::debug!("now playing on {service}: {e:?}");
                }
            }
        });
    }

    /// Sends what is due, by account and service, then plans the failures again.
    pub async fn send_due(&self) -> anyhow::Result<()> {
        let at = now();
        let due: Vec<(String, String, String, Play)> = self
            .db
            .call(move |c| {
                Ok(c.prepare(
                    "SELECT o.user_id, o.service, a.secret, o.id, o.played_at, o.artist, o.title,
                            o.album, o.duration_ms, o.track_no, o.mbid, o.isrc, o.attempts
                       FROM scrobble_outbox o
                       JOIN scrobble_account a ON a.user_id = o.user_id AND a.service = o.service
                      WHERE o.next_at <= ?1 AND a.problem IS NULL
                      ORDER BY o.user_id, o.service, o.played_at LIMIT 500",
                )?
                .query_map([at], |r| {
                    Ok((
                        r.get(0)?,
                        r.get(1)?,
                        r.get(2)?,
                        Play {
                            id: r.get(3)?,
                            played_at: r.get(4)?,
                            artist: r.get(5)?,
                            title: r.get(6)?,
                            album: r.get(7)?,
                            duration_ms: r.get(8)?,
                            track_no: r.get(9)?,
                            mbid: r.get(10)?,
                            isrc: r.get(11)?,
                            attempts: r.get(12)?,
                        },
                    ))
                })?
                .collect::<rusqlite::Result<_>>()?)
            })
            .await?;
        let mut groups: Vec<(String, String, String, Vec<Play>)> = Vec::new();
        for (user, service, sealed, play) in due {
            match groups.last_mut() {
                Some(g) if g.0 == user && g.1 == service && g.3.len() < BATCH => g.3.push(play),
                _ => groups.push((user, service, sealed, vec![play])),
            }
        }
        for (user, service, sealed, mut plays) in groups {
            let secret = self.users.unseal(&sealed)?;
            if service == "lastfm" {
                // Too old for Last.fm: dropped rather than refused forever.
                let (old, fresh): (Vec<Play>, Vec<Play>) = plays
                    .into_iter()
                    .partition(|p| at - p.played_at > LASTFM_MAX_AGE);
                self.forget(old.iter().map(|p| p.id).collect()).await?;
                plays = fresh;
                if plays.is_empty() {
                    continue;
                }
            }
            let sent = match service.as_str() {
                "listenbrainz" => {
                    let kind = if plays.len() == 1 { "single" } else { "import" };
                    self.listenbrainz_send(&secret, kind, &plays).await
                }
                "lastfm" => self.lastfm_scrobble(&secret, &plays).await,
                _ => Err(SendError::Rejected("unknown service".into())),
            };
            let ids: Vec<i64> = plays.iter().map(|p| p.id).collect();
            match sent {
                Ok(()) => {
                    self.forget(ids).await?;
                    self.mark(&user, &service, None).await?;
                }
                Err(SendError::Rejected(msg)) => {
                    tracing::warn!("scrobbling: {service} refused {} plays: {msg}", ids.len());
                    self.forget(ids).await?;
                }
                Err(SendError::Refused(msg)) => {
                    tracing::info!("scrobbling: {service} refused an account's token: {msg}");
                    self.mark(&user, &service, Some(msg)).await?;
                }
                Err(SendError::Later(msg)) => {
                    tracing::debug!("scrobbling: {service} later: {msg}");
                    self.retry_later(&plays).await?;
                }
            }
        }
        Ok(())
    }

    async fn forget(&self, ids: Vec<i64>) -> anyhow::Result<()> {
        if ids.is_empty() {
            return Ok(());
        }
        self.db
            .call(move |c| {
                let tx = c.transaction()?;
                for id in ids {
                    tx.prepare_cached("DELETE FROM scrobble_outbox WHERE id = ?1")?
                        .execute([id])?;
                }
                tx.commit()?;
                Ok(())
            })
            .await
    }

    async fn retry_later(&self, plays: &[Play]) -> anyhow::Result<()> {
        let plan: Vec<(i64, i64)> = plays.iter().map(|p| (p.id, p.attempts + 1)).collect();
        let at = now();
        self.db
            .call(move |c| {
                let tx = c.transaction()?;
                for (id, attempts) in plan {
                    if attempts >= MAX_ATTEMPTS {
                        tx.prepare_cached("DELETE FROM scrobble_outbox WHERE id = ?1")?
                            .execute([id])?;
                    } else {
                        tx.prepare_cached(
                            "UPDATE scrobble_outbox SET attempts = ?2, next_at = ?3 WHERE id = ?1",
                        )?
                        .execute(params![
                            id,
                            attempts,
                            at + backoff(attempts)
                        ])?;
                    }
                }
                tx.commit()?;
                Ok(())
            })
            .await
    }

    /// Sent fine (`problem` none), or refused (`problem` set: nothing goes until it reconnects).
    async fn mark(&self, user: &str, service: &str, problem: Option<String>) -> anyhow::Result<()> {
        let (user, service) = (user.to_owned(), service.to_owned());
        let at = now();
        self.db
            .call(move |c| {
                match problem {
                    None => c.execute(
                        "UPDATE scrobble_account SET sent_at = ?3 WHERE user_id = ?1 AND service = ?2",
                        params![user, service, at],
                    )?,
                    Some(p) => c.execute(
                        "UPDATE scrobble_account SET problem = ?3 WHERE user_id = ?1 AND service = ?2",
                        params![user, service, p],
                    )?,
                };
                Ok(())
            })
            .await
    }

    async fn listenbrainz_send(
        &self,
        token: &str,
        kind: &str,
        plays: &[Play],
    ) -> Result<(), SendError> {
        let payload: Vec<Value> = plays
            .iter()
            .map(|p| {
                let mut info = json!({
                    "submission_client": "Musonic",
                    "submission_client_version": env!("CARGO_PKG_VERSION"),
                    "media_player": "Musonic",
                });
                if p.duration_ms > 0 {
                    info["duration_ms"] = json!(p.duration_ms);
                }
                if let Some(n) = p.track_no {
                    info["tracknumber"] = json!(n);
                }
                if let Some(m) = p.mbid.as_deref().filter(|m| !m.is_empty()) {
                    info["recording_mbid"] = json!(m);
                }
                if let Some(i) = p.isrc.as_deref().filter(|i| !i.is_empty()) {
                    info["isrc"] = json!(i);
                }
                let mut meta = json!({ "artist_name": p.artist, "track_name": p.title, "additional_info": info });
                if !p.album.is_empty() {
                    meta["release_name"] = json!(p.album);
                }
                let mut listen = json!({ "track_metadata": meta });
                if kind != "playing_now" {
                    listen["listened_at"] = json!(p.played_at);
                }
                listen
            })
            .collect();
        let res = self
            .http
            .post(format!("{}/1/submit-listens", self.listenbrainz))
            .header("authorization", format!("Token {token}"))
            .json(&json!({ "listen_type": kind, "payload": payload }))
            .send()
            .await
            .map_err(|e| SendError::Later(format!("unreachable: {e}")))?;
        let status = res.status();
        if status.is_success() {
            return Ok(());
        }
        // ListenBrainz explains in `{"code": …, "error": "…"}`: keep its sentence.
        let text = res.text().await.unwrap_or_default();
        let msg = serde_json::from_str::<Value>(&text)
            .ok()
            .and_then(|v| v["error"].as_str().map(str::to_owned))
            .unwrap_or(text)
            .chars()
            .take(300)
            .collect::<String>();
        Err(match status.as_u16() {
            401 | 403 => SendError::Refused(msg),
            400 => SendError::Rejected(msg),
            _ => SendError::Later(format!("HTTP {status}: {msg}")),
        })
    }

    fn lastfm_app(&self) -> Result<(String, String), SendError> {
        self.lastfm_app
            .read()
            .unwrap()
            .clone()
            .ok_or_else(|| SendError::Later("Last.fm is not set up on this server".into()))
    }

    async fn lastfm_scrobble(&self, session: &str, plays: &[Play]) -> Result<(), SendError> {
        let (key, secret) = self.lastfm_app()?;
        let mut params: Vec<(&str, String)> = vec![("sk", session.to_owned())];
        // Indexed names (`artist[0]`…) must outlive the request: kept as owned keys.
        let mut owned: Vec<(String, String)> = Vec::new();
        for (i, p) in plays.iter().enumerate() {
            owned.push((format!("artist[{i}]"), p.artist.clone()));
            owned.push((format!("track[{i}]"), p.title.clone()));
            owned.push((format!("timestamp[{i}]"), p.played_at.to_string()));
            if !p.album.is_empty() {
                owned.push((format!("album[{i}]"), p.album.clone()));
            }
            if p.duration_ms > 0 {
                owned.push((format!("duration[{i}]"), (p.duration_ms / 1000).to_string()));
            }
            if let Some(n) = p.track_no {
                owned.push((format!("trackNumber[{i}]"), n.to_string()));
            }
            if let Some(m) = p.mbid.as_deref().filter(|m| !m.is_empty()) {
                owned.push((format!("mbid[{i}]"), m.to_owned()));
            }
        }
        params.extend(owned.iter().map(|(k, v)| (k.as_str(), v.clone())));
        self.lastfm_call(&key, &secret, "track.scrobble", params)
            .await
            .map(|_| ())
    }

    async fn lastfm_now_playing(&self, session: &str, p: &Play) -> Result<(), SendError> {
        let (key, secret) = self.lastfm_app()?;
        let mut params: Vec<(&str, String)> = vec![
            ("sk", session.to_owned()),
            ("artist", p.artist.clone()),
            ("track", p.title.clone()),
        ];
        if !p.album.is_empty() {
            params.push(("album", p.album.clone()));
        }
        if p.duration_ms > 0 {
            params.push(("duration", (p.duration_ms / 1000).to_string()));
        }
        self.lastfm_call(&key, &secret, "track.updateNowPlaying", params)
            .await
            .map(|_| ())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lastfm_signature_sorts_and_skips_format() {
        let params = vec![
            ("method", "auth.getSession".to_owned()),
            ("api_key", "KEY".to_owned()),
            ("token", "TOK".to_owned()),
            ("format", "json".to_owned()),
        ];
        let expected = hex::encode(Md5::digest(
            b"api_keyKEYmethodauth.getSessiontokenTOKSECRET",
        ));
        assert_eq!(lastfm_sig(&params, "SECRET"), expected);
    }

    #[test]
    fn backoff_grows_then_stops_at_six_hours() {
        assert_eq!(backoff(0), 60);
        assert_eq!(backoff(1), 120);
        assert_eq!(backoff(30), 6 * 3600);
    }
}
