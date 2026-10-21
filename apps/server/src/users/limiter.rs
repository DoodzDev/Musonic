//! Slows down password guessing: after too many failed sign-ins from one address for one
//! account, further attempts are refused for a while (even with the right password).
//!
//! What counts is how many *different* wrong secrets were tried: an app that keeps retrying a
//! password changed since (it does so on its own, every few seconds) is not guessing, and must
//! not lock its user out once they type the new one.

use std::{
    collections::{HashMap, HashSet},
    sync::Mutex,
    time::{Duration, Instant},
};

const MAX_FAILURES: u32 = 10;
const WINDOW: Duration = Duration::from_secs(15 * 60);

/// Wrong secrets tried (short fingerprints, never the secrets), since when.
type Failures = (HashSet<[u8; 8]>, Instant);

#[derive(Default)]
pub struct AuthLimiter {
    failures: Mutex<HashMap<String, Failures>>,
}

fn fingerprint(secret: &str) -> [u8; 8] {
    let hash = blake3::hash(secret.as_bytes());
    let mut out = [0; 8];
    out.copy_from_slice(&hash.as_bytes()[..8]);
    out
}

impl AuthLimiter {
    fn key(addr: &str, username: &str) -> String {
        format!("{addr}\u{1f}{}", username.to_lowercase())
    }

    /// False while this address is locked out for this account.
    pub fn allowed(&self, addr: &str, username: &str) -> bool {
        let mut map = self.failures.lock().unwrap_or_else(|e| e.into_inner());
        match map.get(&Self::key(addr, username)) {
            Some((tried, since)) if since.elapsed() < WINDOW => tried.len() < MAX_FAILURES as usize,
            Some(_) => {
                map.remove(&Self::key(addr, username));
                true
            }
            None => true,
        }
    }

    /// `secret`: what was tried (password or token); the same one again does not count.
    pub fn failed(&self, addr: &str, username: &str, secret: &str) {
        let mut map = self.failures.lock().unwrap_or_else(|e| e.into_inner());
        if map.len() > 10_000 {
            map.retain(|_, (_, since)| since.elapsed() < WINDOW);
        }
        let entry = map
            .entry(Self::key(addr, username))
            .or_insert_with(|| (HashSet::new(), Instant::now()));
        if entry.1.elapsed() >= WINDOW {
            *entry = (HashSet::new(), Instant::now());
        }
        entry.0.insert(fingerprint(secret));
    }

    pub fn succeeded(&self, addr: &str, username: &str) {
        self.failures
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&Self::key(addr, username));
    }
    /// Address and account pairs refused now, with how many different secrets they tried and
    /// until when (Unix seconds).
    pub fn blocked(&self) -> Vec<Blocked> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or_default();
        let map = self.failures.lock().unwrap_or_else(|e| e.into_inner());
        let mut out: Vec<Blocked> = map
            .iter()
            .filter(|(_, (tried, since))| {
                since.elapsed() < WINDOW && tried.len() >= MAX_FAILURES as usize
            })
            .filter_map(|(key, (tried, since))| {
                let (addr, username) = key.split_once('\u{1f}')?;
                Some(Blocked {
                    addr: addr.to_owned(),
                    username: username.to_owned(),
                    tries: tried.len() as u32,
                    until: now + (WINDOW.saturating_sub(since.elapsed())).as_secs() as i64,
                })
            })
            .collect();
        out.sort_by_key(|b| std::cmp::Reverse(b.until));
        out
    }

    /// Lets this address try this account again.
    pub fn unblock(&self, addr: &str, username: &str) -> bool {
        self.failures
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&Self::key(addr, username))
            .is_some()
    }
}

#[derive(Debug, serde::Serialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Blocked {
    pub addr: String,
    /// The account tried (lower case).
    pub username: String,
    pub tries: u32,
    #[ts(type = "number")]
    pub until: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn locks_out_after_too_many_failures() {
        let l = AuthLimiter::default();
        for i in 0..MAX_FAILURES {
            assert!(l.allowed("1.2.3.4", "Doodz"));
            l.failed("1.2.3.4", "Doodz", &format!("guess {i}"));
        }
        assert!(!l.allowed("1.2.3.4", "doodz"), "same account, any case");
        assert!(l.allowed("5.6.7.8", "doodz"), "other address");
        assert!(l.allowed("1.2.3.4", "other"), "other account");
        let b = l.blocked();
        assert_eq!(
            (b.len(), b[0].addr.as_str(), b[0].username.as_str()),
            (1, "1.2.3.4", "doodz")
        );
        assert!(l.unblock("1.2.3.4", "DOODZ"));
        assert!(l.allowed("1.2.3.4", "doodz"));
        assert!(l.blocked().is_empty());
    }

    #[test]
    fn the_same_old_password_retried_does_not_lock_out() {
        let l = AuthLimiter::default();
        for _ in 0..100 {
            l.failed("1.2.3.4", "Doodz", "old password");
        }
        assert!(
            l.allowed("1.2.3.4", "Doodz"),
            "an app retrying is not guessing"
        );
    }
}
