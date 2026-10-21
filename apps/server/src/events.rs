//! Real-time events (ADR-018): what changed for an account, pushed at once to all its devices
//! through `GET /v1/events` (WebSocket). Likes, ratings, playlists, plays, the saved queue and
//! imports, whatever client made the change (Subsonic ones included).
//!
//! Events are not kept: a device that (re)connects reloads what it shows.

use std::{
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use serde_json::Value;
use tokio::sync::broadcast;
use ts_rs::TS;

/// Events in flight before a slow device misses some (it is then told to reload).
const BUFFER: usize = 512;

#[derive(Debug, Clone)]
pub struct Published {
    /// The account it is about.
    pub user_id: String,
    /// The JSON message: `{"type": …, "at": …, "by": …, …}`.
    pub message: Arc<Value>,
}

/// One message of `/v1/events`. Its TypeScript type is generated in `packages/core`.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct EventMessage {
    /// Unix seconds.
    #[ts(type = "number")]
    pub at: u64,
    /// The device that made the change, when it said (`X-Musonic-Device` / `device`).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub by: Option<String>,
    #[serde(flatten)]
    #[ts(flatten)]
    pub event: Event,
}

/// What happened, by `type`.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(tag = "type", rename_all = "camelCase")]
#[ts(export)]
pub enum Event {
    /// First message of a connection.
    Hello {
        user: UserRef,
        device: Option<String>,
        features: Vec<String>,
    },
    Likes {
        items: Vec<LikeItem>,
    },
    Rating {
        kind: String,
        id: String,
        rating: u8,
    },
    Playlist {
        id: String,
        action: PlaylistAction,
    },
    /// Plays counted.
    Play {
        ids: Vec<String>,
    },
    /// The saved play queue changed.
    Queue {},
    Import {
        id: String,
        state: ImportState,
        path: Option<String>,
    },
    /// A playlist import (ADR-020) went on: `state` `running`, `done` or `failed`; songs
    /// looked for so far, out of `total`; the playlist made, once done.
    PlaylistImport {
        id: String,
        state: String,
        done: u32,
        total: u32,
        playlist: Option<String>,
    },
    /// Keep-alive, every 30 seconds.
    Ping,
    /// Some events were missed: reload what is shown.
    Resync,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct UserRef {
    pub id: String,
    pub username: String,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct LikeItem {
    /// `track`, `album` or `artist`.
    pub kind: String,
    pub id: String,
    pub starred: bool,
}

#[derive(Debug, Clone, Copy, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum PlaylistAction {
    Created,
    Updated,
    Deleted,
}

#[derive(Debug, Clone, Copy, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ImportState {
    Done,
    Failed,
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or_default()
}

impl EventMessage {
    pub fn new(by: Option<&str>, event: Event) -> Self {
        Self {
            at: now(),
            by: by.map(str::to_owned),
            event,
        }
    }

    pub fn to_json(&self) -> Value {
        serde_json::to_value(self).unwrap_or_default()
    }
}

/// Where events are published; cheap to clone.
#[derive(Clone)]
pub struct Events(broadcast::Sender<Published>);

impl Default for Events {
    fn default() -> Self {
        Self(broadcast::channel(BUFFER).0)
    }
}

impl Events {
    /// Publishes `event` to `user_id`'s devices. `by`: the device that made the change, when
    /// it said which (so it can skip its echo).
    pub fn emit(&self, user_id: &str, by: Option<&str>, event: Event) {
        if self.0.receiver_count() == 0 {
            return;
        }
        let _ = self.0.send(Published {
            user_id: user_id.to_owned(),
            message: Arc::new(EventMessage::new(by, event).to_json()),
        });
    }

    pub fn subscribe(&self) -> broadcast::Receiver<Published> {
        self.0.subscribe()
    }
}

/// The device a request comes from, when it says: `X-Musonic-Device` header or `device`
/// parameter (a client-chosen id, see ADR-018).
pub fn device(headers: &axum::http::HeaderMap, param: Option<&str>) -> Option<String> {
    headers
        .get("x-musonic-device")
        .and_then(|v| v.to_str().ok())
        .or(param)
        .map(str::trim)
        .filter(|d| !d.is_empty() && d.len() <= 64)
        .map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn events_reach_subscribers_with_their_fields() {
        let events = Events::default();
        events.emit("u", None, Event::Ping); // nobody listens yet
        let mut rx = events.subscribe();
        let item = LikeItem {
            kind: "track".into(),
            id: "t1".into(),
            starred: true,
        };
        events.emit("u1", Some("phone"), Event::Likes { items: vec![item] });
        let e = rx.recv().await.unwrap();
        assert_eq!(e.user_id, "u1");
        assert_eq!(e.message["type"], "likes");
        assert_eq!(e.message["by"], "phone");
        assert_eq!(e.message["items"][0]["id"], "t1");
        assert!(e.message["at"].as_u64().unwrap() > 1_700_000_000);
        let msg = EventMessage::new(None, Event::Queue {}).to_json();
        assert_eq!(msg["type"], "queue");
        assert!(msg.get("by").is_none());
    }
}
