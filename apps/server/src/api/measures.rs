//! The console's « Données » page: traffic, processor, memory and disk over time.
//!
//! | Route | |
//! |---|---|
//! | `POST /v1/admin/measures` | `{edges}` → one bucket between each two edges (Unix seconds) |
//! | `PUT /v1/admin/traffic-quota` | `{outBytes}`: what the host allows to send each month (0 = none) |
//!
//! The console chooses the edges (hours, days, weeks, months in its own time zone); the server
//! adds up its hourly rows (`metric_hour`) and the measures of the last minute not written yet.

use axum::{
    Json, Router,
    extract::State,
    routing::{post, put},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use ts_rs::TS;

use super::{ApiError, Auth, Reply};
use crate::{metrics::Bucket, server::AppState};

const QUOTA_KEY: &str = "traffic_quota_out_bytes";
/// Oracle Cloud's free monthly outbound traffic.
const DEFAULT_QUOTA: u64 = 10 * 1000 * 1000 * 1000 * 1000;
const MAX_EDGES: usize = 800;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/v1/admin/measures", post(measures))
        .route("/v1/admin/traffic-quota", put(set_quota))
}

#[derive(Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MeasuresRequest {
    /// Increasing Unix seconds; bucket `i` goes from `edges[i]` to `edges[i + 1]`.
    #[ts(type = "number[]")]
    pub edges: Vec<i64>,
}

#[derive(Debug, Default, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Measure {
    #[ts(type = "number")]
    pub start: i64,
    /// The whole machine (0 when it is not visible).
    #[ts(type = "number")]
    pub host_rx: u64,
    #[ts(type = "number")]
    pub host_tx: u64,
    /// The server alone.
    #[ts(type = "number")]
    pub app_rx: u64,
    #[ts(type = "number")]
    pub app_tx: u64,
    /// Average over the measured time, `null` when nothing was measured.
    pub cpu_percent: Option<f32>,
    #[ts(type = "number | null")]
    pub memory_max: Option<u64>,
    /// At the end of the bucket.
    #[ts(type = "number | null")]
    pub disk_used: Option<u64>,
    #[ts(type = "number | null")]
    pub music_bytes: Option<u64>,
    /// Hours with measures.
    pub hours: u32,
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Measures {
    pub buckets: Vec<Measure>,
    /// The machine's traffic is counted (else only the server's).
    pub host_visible: bool,
    /// Monthly outbound allowance, 0 = none.
    #[ts(type = "number")]
    pub quota_out_bytes: u64,
    /// First hour measured (Unix seconds).
    #[ts(type = "number | null")]
    pub since: Option<i64>,
    #[ts(type = "number | null")]
    pub disk_total: Option<u64>,
}

fn admin(auth: &Auth) -> Result<(), ApiError> {
    if auth.user.is_admin {
        Ok(())
    } else {
        Err(ApiError::forbidden())
    }
}

/// Adds an hourly row to the bucket holding it.
fn add(m: &mut Measure, b: &Bucket, disk_used: Option<u64>, music_bytes: Option<u64>) {
    m.host_rx += b.host_rx;
    m.host_tx += b.host_tx;
    m.app_rx += b.app_rx;
    m.app_tx += b.app_tx;
    m.memory_max = Some(m.memory_max.unwrap_or(0).max(b.memory_max));
    m.disk_used = disk_used.or(m.disk_used);
    m.music_bytes = music_bytes.or(m.music_bytes);
}

/// Buckets from hourly rows (sorted by hour), with their samples to average the processor.
fn group(edges: &[i64], rows: &[(Bucket, Option<u64>, Option<u64>)]) -> Vec<Measure> {
    let mut out: Vec<(Measure, f64, u64)> = edges
        .windows(2)
        .map(|w| {
            (
                Measure {
                    start: w[0],
                    ..Default::default()
                },
                0.0,
                0,
            )
        })
        .collect();
    let mut last_hour = vec![i64::MIN; out.len()];
    for (b, disk, music) in rows {
        let at = b.hour * 3600;
        let i = edges.partition_point(|e| *e <= at);
        if i == 0 || i >= edges.len() {
            continue;
        }
        let i = i - 1;
        let (m, cpu, samples) = &mut out[i];
        add(m, b, *disk, *music);
        *cpu += b.cpu_sum;
        *samples += b.samples;
        if last_hour[i] != b.hour {
            m.hours += 1;
            last_hour[i] = b.hour;
        }
    }
    out.into_iter()
        .map(|(mut m, cpu, samples)| {
            if samples > 0 {
                m.cpu_percent = Some((cpu / samples as f64) as f32);
            }
            m
        })
        .collect()
}

async fn quota(state: &AppState) -> Result<u64, ApiError> {
    Ok(state
        .db
        .call(|c| {
            Ok(c.query_row(
                "SELECT value FROM property WHERE key = ?1",
                [QUOTA_KEY],
                |r| r.get::<_, String>(0),
            )
            .ok()
            .and_then(|v| v.parse().ok()))
        })
        .await?
        .unwrap_or(DEFAULT_QUOTA))
}

async fn measures(
    State(state): State<AppState>,
    auth: Auth,
    Json(body): Json<MeasuresRequest>,
) -> Reply {
    admin(&auth)?;
    let edges = body.edges;
    if edges.len() < 2 || edges.len() > MAX_EDGES || edges.windows(2).any(|w| w[0] >= w[1]) {
        return Err(ApiError::bad(format!(
            "edges: 2 to {MAX_EDGES} increasing times"
        )));
    }
    let (from, to) = (edges[0] / 3600, edges[edges.len() - 1] / 3600);
    let (mut rows, since) = state
        .db
        .call(move |c| {
            let rows = c
                .prepare(
                    "SELECT hour, host_rx, host_tx, app_rx, app_tx, cpu_sum, samples, memory_max,
                            disk_used, music_bytes
                       FROM metric_hour WHERE hour >= ?1 AND hour < ?2 ORDER BY hour",
                )?
                .query_map([from, to], |r| {
                    let n = |i| r.get::<_, i64>(i).map(|v| v.max(0) as u64);
                    Ok((
                        Bucket {
                            hour: r.get(0)?,
                            host_rx: n(1)?,
                            host_tx: n(2)?,
                            app_rx: n(3)?,
                            app_tx: n(4)?,
                            cpu_sum: r.get(5)?,
                            samples: n(6)?,
                            memory_max: n(7)?,
                        },
                        r.get::<_, Option<i64>>(8)?.map(|v| v.max(0) as u64),
                        r.get::<_, Option<i64>>(9)?.map(|v| v.max(0) as u64),
                    ))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            let since: Option<i64> =
                c.query_row("SELECT min(hour) * 3600 FROM metric_hour", [], |r| r.get(0))?;
            Ok((rows, since))
        })
        .await?;
    let (mut host_visible, mut since) = (false, since);
    if let Some(m) = &state.metrics {
        host_visible = m.live().host_visible;
        for b in m.pending() {
            if b.hour >= from && b.hour < to {
                rows.push((b.clone(), None, None));
            }
            since = Some(since.map_or(b.hour * 3600, |s| s.min(b.hour * 3600)));
        }
        rows.sort_by_key(|(b, ..)| b.hour);
    }
    let disk_total = state
        .music_dir
        .as_deref()
        .and_then(crate::metrics::disk)
        .or_else(|| crate::metrics::disk(&state.data_dir))
        .map(|(total, _)| total);
    Ok(Json(json!(Measures {
        buckets: group(&edges, &rows),
        host_visible,
        quota_out_bytes: quota(&state).await?,
        since,
        disk_total,
    })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Quota {
    out_bytes: u64,
}

async fn set_quota(State(state): State<AppState>, auth: Auth, Json(q): Json<Quota>) -> Reply {
    admin(&auth)?;
    let v = q.out_bytes.to_string();
    state
        .db
        .call(move |c| {
            c.execute(
                "INSERT INTO property(key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                [QUOTA_KEY, &v],
            )?;
            Ok(())
        })
        .await?;
    state.journal.log(
        crate::journal::Entry::new("settings.quota")
            .by_admin(&auth.user.username)
            .detail(q.out_bytes),
    );
    Ok(Json(json!({ "quotaOutBytes": q.out_bytes })))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(hour: i64, tx: u64, cpu: f64) -> (Bucket, Option<u64>, Option<u64>) {
        (
            Bucket {
                hour,
                host_tx: tx * 2,
                app_tx: tx,
                cpu_sum: cpu,
                samples: 2,
                memory_max: tx,
                ..Default::default()
            },
            Some(tx),
            None,
        )
    }

    #[test]
    fn hours_fall_in_their_bucket() {
        let day = 86400;
        let rows = [
            row(1, 10, 20.0),
            row(23, 5, 0.0),
            row(24, 7, 4.0),
            row(24, 1, 0.0),
        ];
        let m = group(&[0, day, 2 * day], &rows);
        assert_eq!(m.len(), 2);
        assert_eq!((m[0].app_tx, m[0].host_tx, m[0].hours), (15, 30, 2));
        assert_eq!(m[0].cpu_percent, Some(5.0));
        assert_eq!(m[0].memory_max, Some(10));
        assert_eq!(m[0].disk_used, Some(5), "the last hour's disk");
        // The same hour twice (written, and the last minute still in memory).
        assert_eq!((m[1].app_tx, m[1].hours), (8, 1));
        assert_eq!(m[1].cpu_percent, Some(1.0));
        assert_eq!(group(&[100 * 3600, 101 * 3600], &rows)[0].cpu_percent, None);
    }
}
