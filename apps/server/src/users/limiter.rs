//! Slows down password guessing: after too many failed sign-ins from one address for one
//! account, further attempts are refused for a while (even with the right password).

use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};

const MAX_FAILURES: u32 = 10;
const WINDOW: Duration = Duration::from_secs(15 * 60);

#[derive(Default)]
pub struct AuthLimiter {
    failures: Mutex<HashMap<String, (u32, Instant)>>,
}

impl AuthLimiter {
    fn key(addr: &str, username: &str) -> String {
        format!("{addr}\u{1f}{}", username.to_lowercase())
    }

    /// False while this address is locked out for this account.
    pub fn allowed(&self, addr: &str, username: &str) -> bool {
        let mut map = self.failures.lock().unwrap_or_else(|e| e.into_inner());
        match map.get(&Self::key(addr, username)) {
            Some((n, since)) if since.elapsed() < WINDOW => *n < MAX_FAILURES,
            Some(_) => {
                map.remove(&Self::key(addr, username));
                true
            }
            None => true,
        }
    }

    pub fn failed(&self, addr: &str, username: &str) {
        let mut map = self.failures.lock().unwrap_or_else(|e| e.into_inner());
        if map.len() > 10_000 {
            map.retain(|_, (_, since)| since.elapsed() < WINDOW);
        }
        let entry = map
            .entry(Self::key(addr, username))
            .or_insert((0, Instant::now()));
        if entry.1.elapsed() >= WINDOW {
            *entry = (0, Instant::now());
        }
        entry.0 += 1;
    }

    pub fn succeeded(&self, addr: &str, username: &str) {
        self.failures
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&Self::key(addr, username));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn locks_out_after_too_many_failures() {
        let l = AuthLimiter::default();
        for _ in 0..MAX_FAILURES {
            assert!(l.allowed("1.2.3.4", "Doodz"));
            l.failed("1.2.3.4", "Doodz");
        }
        assert!(!l.allowed("1.2.3.4", "doodz"), "same account, any case");
        assert!(l.allowed("5.6.7.8", "doodz"), "other address");
        assert!(l.allowed("1.2.3.4", "other"), "other account");
        l.succeeded("1.2.3.4", "doodz");
        assert!(l.allowed("1.2.3.4", "doodz"));
    }
}
