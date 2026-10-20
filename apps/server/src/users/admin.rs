//! Account management from the administration console (RMP-005): roles, suspension, rights
//! and quotas, invitation links and password reset links.
//!
//! The administrator never sees a password: people choose theirs through a link. Links carry a
//! random token; only its SHA-256 hash is stored, links are used once and expire.

use anyhow::{Result, bail};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::{User, Users, random_token, sha256_hex};
use crate::ids;

/// Longest validity of a link: a year.
pub const MAX_LINK_SECONDS: i64 = 365 * 86400;

/// What a user who is not an administrator may do. Administrators are never limited.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Limits {
    /// Their online songs liked or put in playlists are imported.
    pub can_import: bool,
    /// Online catalog: search, pages, plays.
    pub can_online: bool,
    /// Subsonic `download`.
    pub can_download: bool,
    pub can_public_playlists: bool,
    /// `None` = unlimited.
    pub imports_per_day: Option<u32>,
    pub imports_per_month: Option<u32>,
    /// Bytes.
    #[ts(type = "number | null")]
    pub import_bytes_max: Option<u64>,
    /// kbit/s.
    pub max_bit_rate: Option<u32>,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            can_import: true,
            can_online: true,
            can_download: true,
            can_public_playlists: true,
            imports_per_day: None,
            imports_per_month: None,
            import_bytes_max: None,
            max_bit_rate: None,
        }
    }
}

/// Limits of a user (`None` for administrators: nothing limited).
pub fn limits_of(c: &Connection, user_id: &str) -> rusqlite::Result<Limits> {
    let admin: bool = c
        .query_row("SELECT is_admin FROM user WHERE id = ?1", [user_id], |r| {
            r.get(0)
        })
        .optional()?
        .unwrap_or(false);
    if admin {
        return Ok(Limits::default());
    }
    Ok(c.query_row(
        "SELECT can_import, can_online, can_download, can_public_playlists, imports_per_day,
                imports_per_month, import_bytes_max, max_bit_rate
           FROM user_limits WHERE user_id = ?1",
        [user_id],
        |r| {
            Ok(Limits {
                can_import: r.get(0)?,
                can_online: r.get(1)?,
                can_download: r.get(2)?,
                can_public_playlists: r.get(3)?,
                imports_per_day: r.get(4)?,
                imports_per_month: r.get(5)?,
                import_bytes_max: r.get::<_, Option<i64>>(6)?.map(|b| b.max(0) as u64),
                max_bit_rate: r.get(7)?,
            })
        },
    )
    .optional()?
    .unwrap_or_default())
}

/// Changes to an account; absent fields stay as they are.
#[derive(Debug, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AccountChanges {
    #[ts(optional)]
    pub is_admin: Option<bool>,
    #[ts(optional)]
    pub suspended: Option<bool>,
    #[ts(optional)]
    pub display_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Invitation {
    pub id: String,
    pub note: String,
    pub is_admin: bool,
    pub created_by: Option<String>,
    #[ts(type = "number")]
    pub created_at: i64,
    #[ts(type = "number")]
    pub expires_at: i64,
    /// Username of the account created with it.
    pub used_by: Option<String>,
    #[ts(type = "number | null")]
    pub used_at: Option<i64>,
    #[ts(type = "number | null")]
    pub revoked_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PasswordReset {
    pub id: String,
    pub user_id: String,
    pub username: String,
    pub logout_devices: bool,
    #[ts(type = "number")]
    pub created_at: i64,
    #[ts(type = "number")]
    pub expires_at: i64,
}

/// Why a link cannot be used (the public page says it plainly).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum LinkState {
    Valid,
    Used,
    Expired,
    Revoked,
    Unknown,
}

fn link_state(used: Option<i64>, revoked: Option<i64>, expires: i64) -> LinkState {
    if revoked.is_some() {
        LinkState::Revoked
    } else if used.is_some() {
        LinkState::Used
    } else if expires <= now() {
        LinkState::Expired
    } else {
        LinkState::Valid
    }
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or_default()
}

fn validity(seconds: i64) -> Result<i64> {
    if !(60..=MAX_LINK_SECONDS).contains(&seconds) {
        bail!("a link is valid from one minute to one year");
    }
    Ok(now() + seconds)
}

/// Active administrators other than `except`.
fn other_admins(c: &Connection, except: &str) -> rusqlite::Result<i64> {
    c.query_row(
        "SELECT count(*) FROM user WHERE is_admin = 1 AND suspended = 0 AND id <> ?1",
        [except],
        |r| r.get(0),
    )
}

const INVITATION_SELECT: &str = "
SELECT i.id, i.note, i.is_admin, c.username, i.created_at, i.expires_at, u.username, i.used_at,
       i.revoked_at
  FROM invitation i
  LEFT JOIN user c ON c.id = i.created_by
  LEFT JOIN user u ON u.id = i.used_by";

fn row_invitation(r: &rusqlite::Row) -> rusqlite::Result<Invitation> {
    Ok(Invitation {
        id: r.get(0)?,
        note: r.get(1)?,
        is_admin: r.get(2)?,
        created_by: r.get(3)?,
        created_at: r.get(4)?,
        expires_at: r.get(5)?,
        used_by: r.get(6)?,
        used_at: r.get(7)?,
        revoked_at: r.get(8)?,
    })
}

/// A reset link as stored: id, account, sign devices out, used at, revoked at, expires at.
type ResetRow = (String, String, bool, Option<i64>, Option<i64>, i64);

impl Users {
    /// Role, suspension, name. There is always at least one active administrator.
    pub async fn update(&self, user_id: &str, changes: AccountChanges) -> Result<Option<User>> {
        let id = user_id.to_owned();
        let user = self
            .db
            .call(move |c| {
                let tx = c.transaction()?;
                let exists: bool =
                    tx.query_row("SELECT count(*) > 0 FROM user WHERE id = ?1", [&id], |r| {
                        r.get(0)
                    })?;
                if !exists {
                    return Ok(None);
                }
                let losing_admin =
                    changes.is_admin == Some(false) || changes.suspended == Some(true);
                let is_admin: bool =
                    tx.query_row("SELECT is_admin FROM user WHERE id = ?1", [&id], |r| {
                        r.get(0)
                    })?;
                if losing_admin && is_admin && other_admins(&tx, &id)? == 0 {
                    bail!("the server needs at least one active administrator");
                }
                if let Some(admin) = changes.is_admin {
                    tx.execute(
                        "UPDATE user SET is_admin = ?2 WHERE id = ?1",
                        params![id, admin],
                    )?;
                }
                if let Some(suspended) = changes.suspended {
                    tx.execute(
                        "UPDATE user SET suspended = ?2 WHERE id = ?1",
                        params![id, suspended],
                    )?;
                    if suspended {
                        tx.execute("DELETE FROM session WHERE user_id = ?1", [&id])?;
                    }
                }
                if let Some(name) = changes.display_name {
                    let name: String = name.trim().chars().take(64).collect();
                    tx.execute(
                        "UPDATE user SET display_name = ?2 WHERE id = ?1",
                        params![id, name],
                    )?;
                }
                tx.commit()?;
                Ok(Some(()))
            })
            .await?;
        match user {
            Some(()) => self.get(user_id).await,
            None => Ok(None),
        }
    }

    /// Ends every session and revokes every device key of an account.
    pub async fn logout_everywhere(&self, user_id: &str) -> Result<()> {
        let id = user_id.to_owned();
        self.db
            .call(move |c| {
                c.execute("DELETE FROM session WHERE user_id = ?1", [&id])?;
                c.execute(
                    "UPDATE api_key SET revoked_at = unixepoch() WHERE user_id = ?1 AND revoked_at IS NULL",
                    [&id],
                )?;
                Ok(())
            })
            .await
    }

    pub async fn limits(&self, user_id: &str) -> Result<Limits> {
        let id = user_id.to_owned();
        self.db.call(move |c| Ok(limits_of(c, &id)?)).await
    }

    pub async fn set_limits(&self, user_id: &str, limits: Limits) -> Result<()> {
        let id = user_id.to_owned();
        self.db
            .call(move |c| {
                c.execute(
                    "INSERT INTO user_limits(user_id, can_import, can_online, can_download,
                         can_public_playlists, imports_per_day, imports_per_month, import_bytes_max,
                         max_bit_rate)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                     ON CONFLICT(user_id) DO UPDATE SET can_import = excluded.can_import,
                         can_online = excluded.can_online, can_download = excluded.can_download,
                         can_public_playlists = excluded.can_public_playlists,
                         imports_per_day = excluded.imports_per_day,
                         imports_per_month = excluded.imports_per_month,
                         import_bytes_max = excluded.import_bytes_max,
                         max_bit_rate = excluded.max_bit_rate",
                    params![
                        id,
                        limits.can_import,
                        limits.can_online,
                        limits.can_download,
                        limits.can_public_playlists,
                        limits.imports_per_day,
                        limits.imports_per_month,
                        limits.import_bytes_max.map(|b| b as i64),
                        limits.max_bit_rate
                    ],
                )?;
                Ok(())
            })
            .await
    }

    // Invitations ---------------------------------------------------------------------------

    /// A new invitation link; returns it with its token (to put in the link, shown once).
    pub async fn invite(
        &self,
        note: &str,
        is_admin: bool,
        seconds: i64,
        by: &str,
    ) -> Result<(Invitation, String)> {
        let expires = validity(seconds)?;
        let token = random_token();
        let (id, hash, note, by) = (
            ids::new_id(),
            sha256_hex(&token),
            note.trim().chars().take(80).collect::<String>(),
            by.to_owned(),
        );
        let inv = self
            .db
            .call(move |c| {
                c.execute(
                    "INSERT INTO invitation(id, token_hash, note, is_admin, created_by, expires_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![id, hash, note, is_admin, by, expires],
                )?;
                Ok(c.query_row(
                    &format!("{INVITATION_SELECT} WHERE i.id = ?1"),
                    [&id],
                    row_invitation,
                )?)
            })
            .await?;
        Ok((inv, token))
    }

    pub async fn invitations(&self) -> Result<Vec<Invitation>> {
        self.db
            .call(|c| {
                Ok(
                    c.prepare(&format!("{INVITATION_SELECT} ORDER BY i.created_at DESC"))?
                        .query_map([], row_invitation)?
                        .collect::<rusqlite::Result<_>>()?,
                )
            })
            .await
    }

    pub async fn revoke_invitation(&self, id: &str) -> Result<bool> {
        let id = id.to_owned();
        self.db
            .call(move |c| {
                Ok(c.execute(
                    "UPDATE invitation SET revoked_at = unixepoch()
                      WHERE id = ?1 AND used_at IS NULL AND revoked_at IS NULL",
                    [&id],
                )? > 0)
            })
            .await
    }

    /// What the invitation page shows: its state, who invites, until when.
    pub async fn invitation_by_token(
        &self,
        token: &str,
    ) -> Result<(LinkState, Option<Invitation>)> {
        let hash = sha256_hex(token);
        let inv = self
            .db
            .call(move |c| {
                Ok(c.query_row(
                    &format!("{INVITATION_SELECT} WHERE i.token_hash = ?1"),
                    [&hash],
                    row_invitation,
                )
                .optional()?)
            })
            .await?;
        Ok(match inv {
            None => (LinkState::Unknown, None),
            Some(i) => (link_state(i.used_at, i.revoked_at, i.expires_at), Some(i)),
        })
    }

    /// Creates the account of an invitation (the person chose its name and password).
    pub async fn accept_invitation(
        &self,
        token: &str,
        username: &str,
        password: &str,
    ) -> Result<User> {
        let (state, inv) = self.invitation_by_token(token).await?;
        let Some(inv) = inv.filter(|_| state == LinkState::Valid) else {
            bail!("this invitation cannot be used ({state:?})");
        };
        let user = self.create(username, password, inv.is_admin).await?;
        let (inv_id, user_id) = (inv.id.clone(), user.id.clone());
        let claimed = self
            .db
            .call(move |c| {
                Ok(c.execute(
                    "UPDATE invitation SET used_by = ?2, used_at = unixepoch()
                      WHERE id = ?1 AND used_at IS NULL AND revoked_at IS NULL",
                    params![inv_id, user_id],
                )? > 0)
            })
            .await?;
        if !claimed {
            // Used by someone else at the same moment.
            let _ = self.delete(&user.id).await;
            bail!("this invitation was just used");
        }
        tracing::info!(user = %user.username, "account created from an invitation");
        Ok(user)
    }

    // Password resets -----------------------------------------------------------------------

    /// A new password reset link for an account; earlier unused ones of the account stop working.
    pub async fn password_reset_link(
        &self,
        user_id: &str,
        seconds: i64,
        logout_devices: bool,
        by: &str,
    ) -> Result<Option<(PasswordReset, String)>> {
        let expires = validity(seconds)?;
        let token = random_token();
        let (id, hash, user, by) = (
            ids::new_id(),
            sha256_hex(&token),
            user_id.to_owned(),
            by.to_owned(),
        );
        let reset = self
            .db
            .call(move |c| {
                let Some(username): Option<String> = c
                    .query_row("SELECT username FROM user WHERE id = ?1", [&user], |r| r.get(0))
                    .optional()?
                else {
                    return Ok(None);
                };
                c.execute(
                    "UPDATE password_reset SET revoked_at = unixepoch()
                      WHERE user_id = ?1 AND used_at IS NULL AND revoked_at IS NULL",
                    [&user],
                )?;
                c.execute(
                    "INSERT INTO password_reset(id, token_hash, user_id, logout_devices, created_by, expires_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![id, hash, user, logout_devices, by, expires],
                )?;
                Ok(Some(PasswordReset {
                    id,
                    user_id: user,
                    username,
                    logout_devices,
                    created_at: now(),
                    expires_at: expires,
                }))
            })
            .await?;
        Ok(reset.map(|r| (r, token)))
    }

    /// Reset links not used yet, not expired.
    pub async fn password_resets(&self) -> Result<Vec<PasswordReset>> {
        self.db
            .call(|c| {
                Ok(c.prepare(
                    "SELECT r.id, r.user_id, u.username, r.logout_devices, r.created_at, r.expires_at
                       FROM password_reset r JOIN user u ON u.id = r.user_id
                      WHERE r.used_at IS NULL AND r.revoked_at IS NULL AND r.expires_at > unixepoch()
                      ORDER BY r.created_at DESC",
                )?
                .query_map([], |r| {
                    Ok(PasswordReset {
                        id: r.get(0)?,
                        user_id: r.get(1)?,
                        username: r.get(2)?,
                        logout_devices: r.get(3)?,
                        created_at: r.get(4)?,
                        expires_at: r.get(5)?,
                    })
                })?
                .collect::<rusqlite::Result<_>>()?)
            })
            .await
    }

    pub async fn revoke_password_reset(&self, id: &str) -> Result<bool> {
        let id = id.to_owned();
        self.db
            .call(move |c| {
                Ok(c.execute(
                    "UPDATE password_reset SET revoked_at = unixepoch()
                      WHERE id = ?1 AND used_at IS NULL AND revoked_at IS NULL",
                    [&id],
                )? > 0)
            })
            .await
    }

    /// What the reset page shows: its state and the account's name.
    pub async fn password_reset_by_token(
        &self,
        token: &str,
    ) -> Result<(LinkState, Option<String>)> {
        let hash = sha256_hex(token);
        let found: Option<(String, Option<i64>, Option<i64>, i64)> = self
            .db
            .call(move |c| {
                Ok(c.query_row(
                    "SELECT u.username, r.used_at, r.revoked_at, r.expires_at
                       FROM password_reset r JOIN user u ON u.id = r.user_id WHERE r.token_hash = ?1",
                    [&hash],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
                )
                .optional()?)
            })
            .await?;
        Ok(match found {
            None => (LinkState::Unknown, None),
            Some((name, used, revoked, expires)) => {
                (link_state(used, revoked, expires), Some(name))
            }
        })
    }

    /// Sets the new password chosen through a reset link.
    pub async fn use_password_reset(&self, token: &str, password: &str) -> Result<User> {
        let hash = sha256_hex(token);
        let found: Option<ResetRow> = self
            .db
            .call(move |c| {
                Ok(c.query_row(
                    "SELECT id, user_id, logout_devices, used_at, revoked_at, expires_at
                       FROM password_reset WHERE token_hash = ?1",
                    [&hash],
                    |r| {
                        Ok((
                            r.get(0)?,
                            r.get(1)?,
                            r.get(2)?,
                            r.get(3)?,
                            r.get(4)?,
                            r.get(5)?,
                        ))
                    },
                )
                .optional()?)
            })
            .await?;
        let Some((reset_id, user_id, logout, used, revoked, expires)) = found else {
            bail!("this link cannot be used (Unknown)");
        };
        let state = link_state(used, revoked, expires);
        if state != LinkState::Valid {
            bail!("this link cannot be used ({state:?})");
        }
        self.set_password(&user_id, password).await?;
        let (rid, uid) = (reset_id, user_id.clone());
        self.db
            .call(move |c| {
                c.execute("UPDATE password_reset SET used_at = unixepoch() WHERE id = ?1", [&rid])?;
                if logout {
                    c.execute(
                        "UPDATE api_key SET revoked_at = unixepoch() WHERE user_id = ?1 AND revoked_at IS NULL",
                        [&uid],
                    )?;
                }
                Ok(())
            })
            .await?;
        self.get(&user_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("account gone"))
    }
}
