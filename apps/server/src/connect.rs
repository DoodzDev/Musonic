//! Musonic Connect (ADR-019): the devices of each account that are online, what each one
//! plays, and remote commands between them. The server plays nothing: it keeps the last state
//! of each device, dates it with its own clock and relays it through `/v1/events`.
//!
//! Nothing is written to disk: devices register again when they reconnect. Who pauses when
//! another device starts (« synced playback », an account setting) is decided by the devices
//! themselves, from the states they receive.

use std::{
    collections::HashMap,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

use crate::events::{Event, Events};

/// Server time, ms: what positions are dated with.
pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or_default()
}

/// A device online, as it presented itself (`register`). `ConnectDevice` in TypeScript (the
/// console's `Device` is a device key).
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[serde(rename_all = "camelCase")]
#[ts(export, rename = "ConnectDevice")]
pub struct Device {
    /// Its id: the `device` of `/v1/events`, chosen by the client (set by the server).
    #[serde(default)]
    pub id: String,
    /// Chosen by the user (by default the phone's model, « Firefox on PC »…).
    pub name: String,
    /// `phone`, `web`, `desktop`, `car`, `speaker`…: for the icon.
    pub kind: String,
    /// It can play sound (a remote control cannot).
    #[serde(default = "yes")]
    pub can_play: bool,
    /// Its volume can be set remotely.
    #[serde(default)]
    pub volume: bool,
    /// « This device plays alone »: it never pauses another device and is never paused.
    #[serde(default)]
    pub alone: bool,
}

fn yes() -> bool {
    true
}

/// What a device plays (`player`), sent by that device when it changes, dated by the server.
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS, PartialEq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Player {
    /// The device that plays (set by the server).
    #[serde(default)]
    pub device: String,
    /// The track, none once the queue is empty.
    #[serde(default)]
    #[ts(optional)]
    pub track: Option<String>,
    /// What other devices show without asking the server.
    #[serde(default)]
    #[ts(optional)]
    pub title: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub artist: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub album: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub cover_art: Option<String>,
    /// Seconds.
    #[serde(default)]
    #[ts(optional)]
    pub duration: Option<u32>,
    pub playing: bool,
    /// Position when the state was sent, ms.
    #[ts(type = "number")]
    pub position: u64,
    /// Server time of `position`, ms (set by the server).
    #[serde(default)]
    #[ts(type = "number")]
    pub position_at: i64,
    /// The queue, as the playing device's engine keeps it (ADR-009): taken over by a transfer.
    #[serde(default)]
    #[ts(optional, type = "unknown")]
    pub queue: Option<Value>,
    /// `off`, `on` or `magic`.
    #[serde(default)]
    #[ts(optional)]
    pub shuffle: Option<String>,
    /// `none`, `all` or `one`.
    #[serde(default)]
    #[ts(optional)]
    pub repeat: Option<String>,
    /// 0-100, when the device's volume can be set remotely.
    #[serde(default)]
    #[ts(optional)]
    pub volume: Option<u8>,
}

/// A remote command (`command`), relayed to the device it is for.
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Command {
    /// The device that is to act.
    pub to: String,
    /// Its account, for an administrator acting on another account (the sender's by default).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub user: Option<String>,
    /// `play`, `pause`, `toggle`, `next`, `previous`, `seek`, `volume`, `playItem`, `transfer`.
    pub action: String,
    /// `{position}` (ms) for `seek`, `{volume}` (0-100), what to play for `playItem`, the
    /// state taken over for `transfer`.
    #[serde(default)]
    #[ts(type = "unknown")]
    pub params: Value,
    /// The device that sent it (set by the server).
    #[serde(default)]
    pub from: String,
}

/// What a device sends on `/v1/events`.
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Incoming {
    Register(Device),
    Player(Player),
    Command(Command),
}

/// Why a command was not relayed.
#[derive(Debug, PartialEq)]
pub enum Refused {
    /// Another account's device, and the sender is no administrator.
    NotAllowed,
    /// The device is not online.
    Offline,
}

#[derive(Default)]
struct Account {
    /// By connection: one device may reconnect before its old connection is seen closed.
    devices: Vec<(u64, Device)>,
    players: HashMap<String, Player>,
}

impl Account {
    fn list(&self) -> Vec<Device> {
        self.devices.iter().map(|(_, d)| d.clone()).collect()
    }
}

/// The devices online of every account; cheap to share (`Arc`).
#[derive(Default)]
pub struct Connect {
    accounts: Mutex<HashMap<String, Account>>,
}

impl Connect {
    fn with<T>(&self, f: impl FnOnce(&mut HashMap<String, Account>) -> T) -> T {
        let mut accounts = self.accounts.lock().unwrap_or_else(|e| e.into_inner());
        f(&mut accounts)
    }

    /// `device` (connection `conn`) is online: the account's devices learn it. Returns what
    /// the account's devices play, for the newcomer.
    pub fn register(&self, events: &Events, user: &str, conn: u64, device: Device) -> Vec<Player> {
        self.with(|accounts| {
            let account = accounts.entry(user.to_owned()).or_default();
            account
                .devices
                .retain(|(c, d)| *c != conn && d.id != device.id);
            account.devices.push((conn, device));
            events.emit(
                user,
                None,
                Event::Devices {
                    devices: account.list(),
                },
            );
            let online: Vec<&str> = account.devices.iter().map(|(_, d)| d.id.as_str()).collect();
            account
                .players
                .values()
                .filter(|p| online.contains(&p.device.as_str()))
                .cloned()
                .collect()
        })
    }

    /// Connection `conn` closed: its device leaves, with what it played. Returns that state,
    /// paused where the device was then, when it is the account's last listening to keep
    /// (the device was playing, and not alone): it may have been closed in the middle of a song.
    pub fn leave(&self, events: &Events, user: &str, conn: u64) -> Option<Player> {
        self.with(|accounts| {
            let account = accounts.get_mut(user)?;
            let at = account.devices.iter().position(|(c, _)| *c == conn)?;
            let (_, device) = account.devices.remove(at);
            let last = account
                .players
                .remove(&device.id)
                .filter(|p| p.playing && p.track.is_some() && !device.alone)
                .map(|mut p| {
                    let now = now_ms();
                    let moved = u64::try_from(now - p.position_at).unwrap_or(0);
                    let end = p.duration.map_or(u64::MAX, |d| u64::from(d) * 1000);
                    p.position = (p.position + moved).min(end);
                    p.position_at = now;
                    p.playing = false;
                    p
                });
            events.emit(
                user,
                None,
                Event::Devices {
                    devices: account.list(),
                },
            );
            if account.devices.is_empty() {
                accounts.remove(user);
            }
            last
        })
    }

    /// `device` plays this now: dated, kept and sent to the account's devices. Returns it when
    /// it is the account's last listening to keep (a track, from a device not playing alone).
    pub fn player(
        &self,
        events: &Events,
        user: &str,
        device: &str,
        mut player: Player,
    ) -> Option<Player> {
        player.device = device.to_owned();
        player.position_at = now_ms();
        let alone = self.with(|accounts| {
            let account = accounts.entry(user.to_owned()).or_default();
            account.players.insert(device.to_owned(), player.clone());
            account
                .devices
                .iter()
                .any(|(_, d)| d.id == device && d.alone)
        });
        let last = (player.track.is_some() && !alone).then(|| player.clone());
        events.emit(
            user,
            Some(device),
            Event::Player {
                player,
                now: now_ms(),
            },
        );
        last
    }

    /// A command from `from` (a device of `user`) to a device of the same account, or of any
    /// account for an administrator.
    pub fn command(
        &self,
        events: &Events,
        user: &str,
        admin: bool,
        from: &str,
        mut command: Command,
    ) -> Result<(), Refused> {
        let target = match command.user.as_deref() {
            Some(other) if other != user && !admin => return Err(Refused::NotAllowed),
            Some(other) => other.to_owned(),
            None => user.to_owned(),
        };
        let online = self.with(|accounts| {
            accounts
                .get(&target)
                .is_some_and(|a| a.devices.iter().any(|(_, d)| d.id == command.to))
        });
        if !online {
            return Err(Refused::Offline);
        }
        command.from = from.to_owned();
        events.emit(&target, Some(from), Event::Command { command });
        Ok(())
    }

    /// Every account with a device online, its devices and what they play (for the console).
    pub fn overview(&self) -> Vec<(String, Vec<Device>, Vec<Player>)> {
        self.with(|accounts| {
            accounts
                .iter()
                .map(|(user, a)| {
                    (
                        user.clone(),
                        a.list(),
                        a.players.values().cloned().collect(),
                    )
                })
                .collect()
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn device(id: &str) -> Device {
        Device {
            id: id.into(),
            name: id.into(),
            kind: "web".into(),
            can_play: true,
            volume: true,
            alone: false,
        }
    }

    fn command(to: &str, user: Option<&str>) -> Command {
        Command {
            to: to.into(),
            user: user.map(str::to_owned),
            action: "pause".into(),
            params: Value::Null,
            from: String::new(),
        }
    }

    #[tokio::test]
    async fn devices_come_and_go_with_what_they_play() {
        let (connect, events) = (Connect::default(), Events::default());
        let mut rx = events.subscribe();
        assert!(connect.register(&events, "u1", 1, device("pc")).is_empty());
        let first = rx.recv().await.unwrap();
        assert_eq!(first.message["type"], "devices");
        assert_eq!(first.message["devices"][0]["id"], "pc");

        let playing = Player {
            track: Some("t1".into()),
            playing: true,
            position: 83_250,
            ..Player::default()
        };
        assert!(connect.player(&events, "u1", "pc", playing).is_some());
        let state = rx.recv().await.unwrap();
        assert_eq!(state.message["type"], "player");
        assert_eq!(state.message["player"]["device"], "pc");
        assert!(state.message["player"]["positionAt"].as_i64().unwrap() > 1_700_000_000_000);
        assert!(
            state.message["now"].as_i64().unwrap()
                >= state.message["player"]["positionAt"].as_i64().unwrap()
        );

        // A newcomer gets what plays; a device reconnecting replaces its old connection.
        let now = connect.register(&events, "u1", 2, device("phone"));
        assert_eq!(now.len(), 1);
        assert_eq!(now[0].track.as_deref(), Some("t1"));
        connect.register(&events, "u1", 3, device("phone"));
        assert_eq!(connect.overview()[0].1.len(), 2);

        // The playing device leaves: its state goes with it, kept as the account's last
        // listening, paused where it was.
        let last = connect.leave(&events, "u1", 1).unwrap();
        assert!(!last.playing && last.position >= 83_250);
        assert!(
            connect
                .register(&events, "u1", 4, device("tablet"))
                .is_empty()
        );
        assert!(connect.leave(&events, "u1", 3).is_none());
        assert!(connect.leave(&events, "u1", 4).is_none());
        assert!(connect.overview().is_empty());
    }

    #[tokio::test]
    async fn commands_reach_online_devices_of_the_account_or_an_admin() {
        let (connect, events) = (Connect::default(), Events::default());
        let mut rx = events.subscribe();
        connect.register(&events, "u1", 1, device("pc"));
        connect.register(&events, "u2", 2, device("phone"));
        let _ = (rx.recv().await, rx.recv().await);

        assert_eq!(
            connect.command(&events, "u1", false, "web", command("gone", None)),
            Err(Refused::Offline)
        );
        assert_eq!(
            connect.command(&events, "u1", false, "pc", command("phone", Some("u2"))),
            Err(Refused::NotAllowed)
        );

        connect
            .command(&events, "u1", false, "web", command("pc", None))
            .unwrap();
        let sent = rx.recv().await.unwrap();
        assert_eq!(sent.user_id, "u1");
        assert_eq!(sent.message["type"], "command");
        assert_eq!(sent.message["command"]["to"], "pc");
        assert_eq!(sent.message["command"]["from"], "web");

        // An administrator acts on another account's device.
        connect
            .command(&events, "u1", true, "pc", command("phone", Some("u2")))
            .unwrap();
        assert_eq!(rx.recv().await.unwrap().user_id, "u2");
    }

    #[test]
    fn devices_send_three_kinds_of_message() {
        let register: Incoming = serde_json::from_str(
            r#"{"type":"register","name":"Pixel 10","kind":"phone","volume":true}"#,
        )
        .unwrap();
        assert!(matches!(register, Incoming::Register(d) if d.can_play && d.volume && !d.alone));
        let player: Incoming =
            serde_json::from_str(r#"{"type":"player","track":"t1","playing":false,"position":12}"#)
                .unwrap();
        assert!(matches!(player, Incoming::Player(p) if p.position == 12 && !p.playing));
        let command: Incoming = serde_json::from_str(
            r#"{"type":"command","to":"pc","action":"seek","params":{"position":5000}}"#,
        )
        .unwrap();
        assert!(matches!(command, Incoming::Command(c) if c.params["position"] == 5000));
        assert!(serde_json::from_str::<Incoming>(r#"{"type":"hello"}"#).is_err());
    }
}
