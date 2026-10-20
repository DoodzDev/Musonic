//! `GET /v1/admin/status`: everything the console's dashboard and event bar show, for
//! administrators. Live figures come from [`crate::metrics`]; the rest from the database.

use axum::{Json, extract::State};
use serde::Serialize;
use serde_json::json;
use ts_rs::TS;

use super::{ApiError, Auth, Reply};
use crate::{
    metrics::{self, Folders, Live, Releases},
    server::AppState,
};

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AdminStatus {
    pub version: String,
    pub live: Live,
    pub disk: Option<Disk>,
    pub library: Library,
    pub folders: Folders,
    pub now_playing: Vec<Playing>,
    pub imports: Imports,
    pub alerts: Vec<Alert>,
    pub recent: Vec<Activity>,
    pub releases: Releases,
    /// A newer server is released.
    pub server_update: bool,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Disk {
    #[ts(type = "number")]
    pub total_bytes: u64,
    #[ts(type = "number")]
    pub free_bytes: u64,
}

#[derive(Default, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Library {
    pub tracks: u32,
    pub albums: u32,
    pub artists: u32,
    #[ts(type = "number")]
    pub duration_secs: u64,
    /// Files present.
    #[ts(type = "number")]
    pub bytes: u64,
    /// Of which imported by the server.
    #[ts(type = "number")]
    pub imported_bytes: u64,
    pub accounts: u32,
    pub devices: u32,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Playing {
    pub username: String,
    pub title: String,
    pub artist: String,
    pub player: String,
    #[ts(type = "number")]
    pub since: i64,
}

#[derive(Default, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Imports {
    #[ts(type = "number")]
    pub pending: i64,
    #[ts(type = "number")]
    pub running: i64,
    #[ts(type = "number")]
    pub failed: i64,
    #[ts(type = "number")]
    pub done: i64,
}

/// Something to look at, worst first. The console writes the sentence, in its language.
#[derive(Default, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Alert {
    /// `credentials`, `imports`, `disk`, `backup`, `update`.
    pub kind: String,
    /// `error` or `warning`.
    pub level: String,
    /// `credentials`: the provider.
    pub provider: Option<String>,
    /// `imports`: how many were given up.
    #[ts(type = "number | null")]
    pub count: Option<i64>,
    /// `disk`: free bytes.
    #[ts(type = "number | null")]
    pub free_bytes: Option<u64>,
    /// `backup`: when the last one was made (Unix seconds).
    #[ts(type = "number | null")]
    pub since: Option<i64>,
    /// `update`: the version released, and the one installed.
    pub version: Option<String>,
    pub current: Option<String>,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Activity {
    /// `import`, `login`, `account`.
    pub kind: String,
    #[ts(type = "number")]
    pub at: i64,
    pub who: Option<String>,
    pub what: String,
}

pub async fn status(State(state): State<AppState>, auth: Auth) -> Reply {
    if !auth.user.is_admin {
        return Err(ApiError::forbidden());
    }
    let import_prefix = format!("{}/%", state.import_dir.trim_end_matches('/'));
    let (library, recent, imports) = state
        .db
        .call(move |c| {
            let library = c.query_row(
                "SELECT (SELECT count(DISTINCT track_id) FROM track_file WHERE missing = 0),
                        (SELECT count(DISTINCT t.album_id) FROM track t JOIN track_file f
                           ON f.track_id = t.id AND f.missing = 0),
                        (SELECT count(DISTINCT ta.artist_id) FROM track_artist ta JOIN track_file f
                           ON f.track_id = ta.track_id AND f.missing = 0),
                        (SELECT coalesce(sum(t.duration_ms), 0) / 1000 FROM track t
                          WHERE EXISTS (SELECT 1 FROM track_file f WHERE f.track_id = t.id AND f.missing = 0)),
                        (SELECT coalesce(sum(size), 0) FROM track_file WHERE missing = 0),
                        (SELECT coalesce(sum(size), 0) FROM track_file WHERE missing = 0 AND path LIKE ?1),
                        (SELECT count(*) FROM user),
                        (SELECT count(*) FROM api_key WHERE revoked_at IS NULL)",
                [&import_prefix],
                |r| {
                    Ok(Library {
                        tracks: r.get(0)?,
                        albums: r.get(1)?,
                        artists: r.get(2)?,
                        duration_secs: r.get::<_, i64>(3)?.max(0) as u64,
                        bytes: r.get::<_, i64>(4)?.max(0) as u64,
                        imported_bytes: r.get::<_, i64>(5)?.max(0) as u64,
                        accounts: r.get(6)?,
                        devices: r.get(7)?,
                    })
                },
            )?;
            let recent = c
                .prepare(
                    "SELECT * FROM (
                        SELECT 'import' AS kind, j.updated_at AS at, u.username, t.title || ' — ' || t.artist_display
                          FROM import_job j JOIN track t ON t.id = j.track_id
                          LEFT JOIN user u ON u.id = j.requested_by WHERE j.state = 'done'
                        UNION ALL
                        SELECT 'login', last_login_at, username, '' FROM user WHERE last_login_at IS NOT NULL
                        UNION ALL
                        SELECT 'account', created_at, username, '' FROM user)
                     ORDER BY at DESC LIMIT 8",
                )?
                .query_map([], |r| {
                    Ok(Activity {
                        kind: r.get(0)?,
                        at: r.get(1)?,
                        who: r.get(2)?,
                        what: r.get(3)?,
                    })
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            let counts = crate::library::import::counts(c)?;
            Ok((
                library,
                recent,
                Imports {
                    pending: counts.pending,
                    running: counts.running,
                    failed: counts.failed,
                    done: counts.done,
                },
            ))
        })
        .await?;

    // Now playing, with titles.
    let playing = state.now_playing.list();
    let ids: Vec<String> = playing.iter().map(|p| p.track_id.clone()).collect();
    let titles: Vec<(String, String)> = state
        .db
        .call(move |c| {
            let mut st = c.prepare("SELECT title, artist_display FROM track WHERE id = ?1")?;
            Ok(ids
                .iter()
                .map(|id| {
                    st.query_row([id], |r| Ok((r.get(0)?, r.get(1)?)))
                        .unwrap_or_default()
                })
                .collect())
        })
        .await?;
    let now_playing = playing
        .into_iter()
        .zip(titles)
        .map(|(p, (title, artist))| Playing {
            username: p.username,
            title,
            artist,
            player: p.client,
            since: p.since,
        })
        .collect();

    let (live, folders, releases) = match &state.metrics {
        Some(m) => (m.live(), m.folders(), m.releases()),
        None => Default::default(),
    };
    let disk = state
        .music_dir
        .as_deref()
        .and_then(metrics::disk)
        .or_else(|| metrics::disk(&state.data_dir))
        .map(|(total_bytes, free_bytes)| Disk {
            total_bytes,
            free_bytes,
        });
    let version = env!("CARGO_PKG_VERSION").to_owned();
    let server_update = releases
        .server
        .as_ref()
        .is_some_and(|r| metrics::is_newer(&r.version, &version));

    let mut alerts = Vec::new();
    for (provider, what) in state.provider_health.alerts() {
        if what == "credentials_expired" {
            alerts.push(Alert {
                kind: "credentials".into(),
                level: "error".into(),
                provider: Some(provider.to_owned()),
                ..Default::default()
            });
        }
    }
    if imports.failed > 0 {
        alerts.push(Alert {
            kind: "imports".into(),
            level: "warning".into(),
            count: Some(imports.failed),
            ..Default::default()
        });
    }
    if let Some(d) = &disk
        && d.total_bytes > 0
        && d.free_bytes * 10 < d.total_bytes
    {
        alerts.push(Alert {
            kind: "disk".into(),
            level: "error".into(),
            free_bytes: Some(d.free_bytes),
            ..Default::default()
        });
    }
    if let Some(at) = folders.last_backup_at
        && (now() - at) > 2 * 86400
    {
        alerts.push(Alert {
            kind: "backup".into(),
            level: "warning".into(),
            since: Some(at),
            ..Default::default()
        });
    }
    if server_update {
        alerts.push(Alert {
            kind: "update".into(),
            level: "warning".into(),
            version: releases.server.as_ref().map(|r| r.version.clone()),
            current: Some(version.clone()),
            ..Default::default()
        });
    }

    Ok(Json(json!(AdminStatus {
        version,
        live,
        disk,
        library,
        folders,
        now_playing,
        imports,
        alerts,
        recent,
        releases,
        server_update,
    })))
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or_default()
}
