//! Accounts, per-device API keys and sign-in sessions.
//!
//! Passwords are hashed with argon2id. With the legacy Subsonic token auth enabled (default, for
//! the clients that need it), the password is also kept encrypted ([`secret::SecretBox`]).
//! API keys and session tokens are random and stored as SHA-256 hashes only.

pub mod admin;
pub mod limiter;
pub mod secret;

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use anyhow::{Result, bail};
use argon2::{
    Argon2,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString, rand_core::OsRng},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use rand::RngCore;
use rusqlite::{OptionalExtension, params};
use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::{db::Db, ids};
use secret::SecretBox;

/// Prefix of API keys, so they are easy to spot (and to revoke if leaked).
pub const API_KEY_PREFIX: &str = "msk_";
/// Sessions of the web client and native API last this long without use.
pub const SESSION_DAYS: i64 = 30;
pub const MIN_PASSWORD_LEN: usize = 8;

#[derive(Debug, Clone, Serialize)]
pub struct User {
    pub id: String,
    pub username: String,
    pub display_name: String,
    pub is_admin: bool,
    pub created_at: i64,
    pub last_login_at: Option<i64>,
    /// Cannot sign in (set from the administration console).
    pub suspended: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ApiKeyInfo {
    pub id: String,
    pub name: String,
    pub created_at: i64,
    pub last_used_at: Option<i64>,
}

#[derive(Clone)]
pub struct Users {
    db: Db,
    secrets: Arc<SecretBox>,
    /// Keep an encrypted copy of passwords for the Subsonic `t` + `s` auth.
    pub legacy_auth: bool,
    verified: Arc<Verified>,
}

/// Passwords checked recently. Subsonic clients send the password with every request (each
/// cover, each song: `p`), and checking it with argon2 takes tens of milliseconds: a checked
/// one is remembered as a keyed SHA-256 of the stored hash and the password, so a new
/// password (another stored hash) or another password never matches. Memory only.
struct Verified {
    key: [u8; 32],
    seen: Mutex<HashMap<String, ([u8; 32], Instant)>>,
}

/// How long a checked password is remembered.
const VERIFIED_FOR: Duration = Duration::from_secs(3600);
/// Accounts remembered at most (all forgotten beyond).
const VERIFIED_MAX: usize = 1024;

impl Verified {
    fn new() -> Self {
        let mut key = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut key);
        Self {
            key,
            seen: Mutex::default(),
        }
    }

    fn digest(&self, hash: &str, password: &str) -> [u8; 32] {
        let mut h = Sha256::new();
        h.update(self.key);
        h.update(hash.as_bytes());
        h.update([0]);
        h.update(password.as_bytes());
        h.finalize().into()
    }

    fn knows(&self, user_id: &str, hash: &str, password: &str) -> bool {
        let digest = self.digest(hash, password);
        self.seen.lock().is_ok_and(|seen| {
            seen.get(user_id)
                .is_some_and(|(d, at)| *d == digest && at.elapsed() < VERIFIED_FOR)
        })
    }

    fn remember(&self, user_id: &str, hash: &str, password: &str) {
        let digest = self.digest(hash, password);
        if let Ok(mut seen) = self.seen.lock() {
            if seen.len() >= VERIFIED_MAX {
                seen.clear();
            }
            seen.insert(user_id.to_owned(), (digest, Instant::now()));
        }
    }
}

pub(crate) fn sha256_hex(text: &str) -> String {
    hex::encode(Sha256::digest(text.as_bytes()))
}

pub(crate) fn random_token() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn hash_password(password: &str) -> Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| anyhow::anyhow!("hashing password: {e}"))
}

fn verify_password(password: &str, hash: &str) -> bool {
    PasswordHash::new(hash).is_ok_and(|h| {
        Argon2::default()
            .verify_password(password.as_bytes(), &h)
            .is_ok()
    })
}

/// Lower case hex md5, as in Subsonic tokens (only to check them, never to store anything).
pub(crate) fn md5_hex(text: &str) -> String {
    hex::encode(md5::Md5::digest(text.as_bytes()))
}

/// Why a sign-in failed (each maps to a Subsonic error code).
#[derive(Debug, PartialEq, Eq)]
pub enum AuthError {
    /// Unknown user or wrong password / token.
    WrongCredentials,
    /// Token auth asked but not available for this account.
    TokenAuthUnavailable,
    /// Unknown or revoked API key.
    InvalidApiKey,
    /// Right credentials, but the account is suspended (only said to its rightful owner).
    Suspended,
}

fn row_user(r: &rusqlite::Row) -> rusqlite::Result<User> {
    Ok(User {
        id: r.get(0)?,
        username: r.get(1)?,
        display_name: r.get(2)?,
        is_admin: r.get::<_, i64>(3)? != 0,
        created_at: r.get(4)?,
        last_login_at: r.get(5)?,
        suspended: r.get::<_, i64>(6)? != 0,
    })
}

const USER_COLUMNS: &str =
    "id, username, display_name, is_admin, created_at, last_login_at, suspended";

impl Users {
    pub fn new(db: Db, secrets: SecretBox, legacy_auth: bool) -> Self {
        Self {
            db,
            secrets: Arc::new(secrets),
            legacy_auth,
            verified: Arc::new(Verified::new()),
        }
    }

    pub async fn count(&self) -> Result<i64> {
        self.db
            .call(|c| Ok(c.query_row("SELECT count(*) FROM user", [], |r| r.get(0))?))
            .await
    }

    pub async fn create(&self, username: &str, password: &str, is_admin: bool) -> Result<User> {
        let username = username.trim().to_owned();
        if username.is_empty() || username.len() > 64 || username.chars().any(char::is_control) {
            bail!("invalid username");
        }
        if password.chars().count() < MIN_PASSWORD_LEN {
            bail!("the password needs at least {MIN_PASSWORD_LEN} characters");
        }
        let hash = hash_password(password)?;
        let legacy = if self.legacy_auth {
            Some(self.secrets.encrypt(password)?)
        } else {
            None
        };
        let id = ids::new_id();
        let user = self
            .db
            .call(move |c| {
                let taken: bool =
                    c.query_row("SELECT count(*) > 0 FROM user WHERE username = ?1", [&username], |r| r.get(0))?;
                if taken {
                    bail!("this username is taken");
                }
                c.execute(
                    "INSERT INTO user(id, username, display_name, password_hash, legacy_password_enc, is_admin)
                     VALUES (?1, ?2, ?2, ?3, ?4, ?5)",
                    params![id, username, hash, legacy, is_admin],
                )?;
                Ok(c.query_row(&format!("SELECT {USER_COLUMNS} FROM user WHERE id = ?1"), [&id], row_user)?)
            })
            .await?;
        tracing::info!(user = %user.username, admin = user.is_admin, "account created");
        Ok(user)
    }

    pub async fn list(&self) -> Result<Vec<User>> {
        self.db
            .call(|c| {
                let mut st = c.prepare(&format!(
                    "SELECT {USER_COLUMNS} FROM user ORDER BY username"
                ))?;
                Ok(st
                    .query_map([], row_user)?
                    .collect::<rusqlite::Result<_>>()?)
            })
            .await
    }

    pub async fn get(&self, id: &str) -> Result<Option<User>> {
        let id = id.to_owned();
        self.db
            .call(move |c| {
                Ok(c.query_row(
                    &format!("SELECT {USER_COLUMNS} FROM user WHERE id = ?1"),
                    [&id],
                    row_user,
                )
                .optional()?)
            })
            .await
    }

    pub async fn set_password(&self, user_id: &str, password: &str) -> Result<()> {
        if password.chars().count() < MIN_PASSWORD_LEN {
            bail!("the password needs at least {MIN_PASSWORD_LEN} characters");
        }
        let hash = hash_password(password)?;
        let legacy = if self.legacy_auth {
            Some(self.secrets.encrypt(password)?)
        } else {
            None
        };
        let id = user_id.to_owned();
        self.db
            .call(move |c| {
                c.execute(
                    "UPDATE user SET password_hash = ?2, legacy_password_enc = ?3 WHERE id = ?1",
                    params![id, hash, legacy],
                )?;
                // A new password signs every other session out.
                c.execute("DELETE FROM session WHERE user_id = ?1", [&id])?;
                Ok(())
            })
            .await
    }

    /// Deletes an account and everything that belongs to it. The last administrator stays.
    pub async fn delete(&self, user_id: &str) -> Result<bool> {
        let id = user_id.to_owned();
        self.db
            .call(move |c| {
                let admins: i64 = c.query_row(
                    "SELECT count(*) FROM user WHERE is_admin = 1 AND id <> ?1",
                    [&id],
                    |r| r.get(0),
                )?;
                let is_admin: Option<bool> = c
                    .query_row("SELECT is_admin FROM user WHERE id = ?1", [&id], |r| {
                        r.get(0)
                    })
                    .optional()?;
                if is_admin == Some(true) && admins == 0 {
                    bail!("the last administrator cannot be deleted");
                }
                Ok(c.execute("DELETE FROM user WHERE id = ?1", [&id])? > 0)
            })
            .await
    }

    async fn credentials(&self, username: &str) -> Result<Option<(User, String, Option<String>)>> {
        let username = username.to_owned();
        self.db
            .call(move |c| {
                Ok(c.query_row(
                    &format!("SELECT {USER_COLUMNS}, password_hash, legacy_password_enc FROM user WHERE username = ?1"),
                    [&username],
                    |r| Ok((row_user(r)?, r.get(7)?, r.get(8)?)),
                )
                .optional()?)
            })
            .await
    }

    async fn touch_login(&self, user_id: &str) {
        let id = user_id.to_owned();
        let _ = self
            .db
            .call(move |c| {
                Ok(c.execute(
                    "UPDATE user SET last_login_at = unixepoch()
                      WHERE id = ?1 AND coalesce(last_login_at, 0) < unixepoch() - 60",
                    [&id],
                )?)
            })
            .await;
    }

    /// Username + password (the Subsonic `p` parameter, or the sign-in form).
    pub async fn check_password(
        &self,
        username: &str,
        password: &str,
    ) -> Result<Result<User, AuthError>> {
        let Some((user, hash, _)) = self.credentials(username).await? else {
            // Same work as a real check, so timing does not tell which usernames exist.
            let _ = verify_password(
                password,
                "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$aGFzaGhhc2hoYXNoaGFzaA",
            );
            return Ok(Err(AuthError::WrongCredentials));
        };
        if !self.verified.knows(&user.id, &hash, password) {
            let (pw, stored) = (password.to_owned(), hash.clone());
            let ok = tokio::task::spawn_blocking(move || verify_password(&pw, &stored)).await?;
            if !ok {
                return Ok(Err(AuthError::WrongCredentials));
            }
            self.verified.remember(&user.id, &hash, password);
        }
        if user.suspended {
            return Ok(Err(AuthError::Suspended));
        }
        self.touch_login(&user.id).await;
        Ok(Ok(user))
    }

    /// Legacy Subsonic token: `token = md5(password + salt)`.
    pub async fn check_token(
        &self,
        username: &str,
        token: &str,
        salt: &str,
    ) -> Result<Result<User, AuthError>> {
        if !self.legacy_auth {
            return Ok(Err(AuthError::TokenAuthUnavailable));
        }
        let Some((user, _, legacy)) = self.credentials(username).await? else {
            return Ok(Err(AuthError::WrongCredentials));
        };
        let Some(sealed) = legacy else {
            return Ok(Err(AuthError::TokenAuthUnavailable));
        };
        let password = self.secrets.decrypt(&sealed)?;
        if md5_hex(&format!("{password}{salt}")) != token.to_ascii_lowercase() {
            return Ok(Err(AuthError::WrongCredentials));
        }
        if user.suspended {
            return Ok(Err(AuthError::Suspended));
        }
        Ok(Ok(user))
    }

    /// A new API key for a device. The key is returned once; only its hash is kept.
    pub async fn create_api_key(&self, user_id: &str, name: &str) -> Result<(ApiKeyInfo, String)> {
        let key = format!("{API_KEY_PREFIX}{}", random_token());
        let hash = sha256_hex(&key);
        let (id, user, name) = (
            ids::new_id(),
            user_id.to_owned(),
            name.trim().chars().take(64).collect::<String>(),
        );
        let info = self
            .db
            .call(move |c| {
                c.execute(
                    "INSERT INTO api_key(id, user_id, name, key_hash) VALUES (?1, ?2, ?3, ?4)",
                    params![id, user, name, hash],
                )?;
                Ok(c.query_row(
                    "SELECT id, name, created_at, last_used_at FROM api_key WHERE id = ?1",
                    [&id],
                    |r| {
                        Ok(ApiKeyInfo {
                            id: r.get(0)?,
                            name: r.get(1)?,
                            created_at: r.get(2)?,
                            last_used_at: r.get(3)?,
                        })
                    },
                )?)
            })
            .await?;
        Ok((info, key))
    }

    pub async fn api_keys(&self, user_id: &str) -> Result<Vec<ApiKeyInfo>> {
        let id = user_id.to_owned();
        self.db
            .call(move |c| {
                let mut st = c.prepare(
                    "SELECT id, name, created_at, last_used_at FROM api_key
                     WHERE user_id = ?1 AND revoked_at IS NULL ORDER BY created_at",
                )?;
                Ok(st
                    .query_map([&id], |r| {
                        Ok(ApiKeyInfo {
                            id: r.get(0)?,
                            name: r.get(1)?,
                            created_at: r.get(2)?,
                            last_used_at: r.get(3)?,
                        })
                    })?
                    .collect::<rusqlite::Result<_>>()?)
            })
            .await
    }

    pub async fn revoke_api_key(&self, user_id: &str, key_id: &str) -> Result<bool> {
        let (user, key) = (user_id.to_owned(), key_id.to_owned());
        self.db
            .call(move |c| {
                Ok(c.execute(
                    "UPDATE api_key SET revoked_at = unixepoch() WHERE id = ?1 AND user_id = ?2 AND revoked_at IS NULL",
                    [&key, &user],
                )? > 0)
            })
            .await
    }

    pub async fn check_api_key(&self, key: &str) -> Result<Result<User, AuthError>> {
        if !key.starts_with(API_KEY_PREFIX) {
            return Ok(Err(AuthError::InvalidApiKey));
        }
        let hash = sha256_hex(key);
        let user = self
            .db
            .call(move |c| {
                let user = c
                    .query_row(
                        &format!(
                            "SELECT {} FROM user u JOIN api_key k ON k.user_id = u.id
                             WHERE k.key_hash = ?1 AND k.revoked_at IS NULL",
                            USER_COLUMNS
                                .split(", ")
                                .map(|col| format!("u.{col}"))
                                .collect::<Vec<_>>()
                                .join(", ")
                        ),
                        [&hash],
                        row_user,
                    )
                    .optional()?;
                if user.is_some() {
                    c.execute(
                        "UPDATE api_key SET last_used_at = unixepoch()
                          WHERE key_hash = ?1 AND coalesce(last_used_at, 0) < unixepoch() - 60",
                        [&hash],
                    )?;
                }
                Ok(user)
            })
            .await?;
        match user {
            Some(u) if u.suspended => Ok(Err(AuthError::Suspended)),
            Some(u) => Ok(Ok(u)),
            None => Ok(Err(AuthError::InvalidApiKey)),
        }
    }

    /// A sign-in session for the web client / native API. Returns the token (shown once).
    pub async fn create_session(&self, user_id: &str) -> Result<String> {
        let token = random_token();
        let (hash, id) = (sha256_hex(&token), user_id.to_owned());
        self.db
            .call(move |c| {
                c.execute(
                    "INSERT INTO session(token_hash, user_id, expires_at) VALUES (?1, ?2, unixepoch() + ?3)",
                    params![hash, id, SESSION_DAYS * 86400],
                )?;
                Ok(())
            })
            .await?;
        Ok(token)
    }

    /// The user of a valid session; extends it (sliding expiry).
    pub async fn check_session(&self, token: &str) -> Result<Option<User>> {
        let hash = sha256_hex(token);
        self.db
            .call(move |c| {
                let user = c
                    .query_row(
                        &format!(
                            "SELECT {} FROM user u JOIN session s ON s.user_id = u.id
                             WHERE s.token_hash = ?1 AND s.expires_at > unixepoch() AND u.suspended = 0",
                            USER_COLUMNS.split(", ").map(|col| format!("u.{col}")).collect::<Vec<_>>().join(", ")
                        ),
                        [&hash],
                        row_user,
                    )
                    .optional()?;
                if user.is_some() {
                    c.execute(
                        "UPDATE session SET last_seen_at = unixepoch(), expires_at = unixepoch() + ?2
                          WHERE token_hash = ?1 AND coalesce(last_seen_at, 0) < unixepoch() - 60",
                        params![hash, SESSION_DAYS * 86400],
                    )?;
                }
                Ok(user)
            })
            .await
    }

    pub async fn end_session(&self, token: &str) -> Result<()> {
        let hash = sha256_hex(token);
        self.db
            .call(move |c| {
                Ok(
                    c.execute("DELETE FROM session WHERE token_hash = ?1", [&hash])
                        .map(|_| ())?,
                )
            })
            .await
    }
}

#[cfg(test)]
mod tests;
