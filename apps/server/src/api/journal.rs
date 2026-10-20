//! The console's « Activité » and « Journal d'administration » pages.
//!
//! | Route | |
//! |---|---|
//! | `GET /v1/admin/journal` | Lines, newest first ([`JournalQuery`]: `admin`, `before`, `after`, `kind`, `user`, `q`, `from`, `to`, `limit`), and the journal's size |
//! | `PUT /v1/admin/journal/settings` | `{maxBytes}`: maximum size of the journal (the oldest lines go past it) |

use axum::{
    Json, Router,
    extract::{Query, State},
    routing::{get, put},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use ts_rs::TS;

use super::{ApiError, Auth, Reply};
use crate::{
    journal::{Entry, JournalEntry, JournalQuery, JournalSize},
    server::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/v1/admin/journal", get(read))
        .route("/v1/admin/journal/settings", put(settings))
}

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct JournalPage {
    pub entries: Vec<JournalEntry>,
    pub size: JournalSize,
}

fn admin(auth: &Auth) -> Result<(), ApiError> {
    if auth.user.is_admin {
        Ok(())
    } else {
        Err(ApiError::forbidden())
    }
}

async fn read(State(state): State<AppState>, auth: Auth, Query(q): Query<JournalQuery>) -> Reply {
    admin(&auth)?;
    Ok(Json(json!(JournalPage {
        entries: state.journal.read(q).await?,
        size: state.journal.size().await?,
    })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Settings {
    max_bytes: u64,
}

async fn settings(State(state): State<AppState>, auth: Auth, Json(s): Json<Settings>) -> Reply {
    admin(&auth)?;
    let max = state.journal.set_max_bytes(&state.db, s.max_bytes).await?;
    state.journal.log(
        Entry::new("settings.journal")
            .by_admin(&auth.user.username)
            .detail(max),
    );
    Ok(Json(json!(state.journal.size().await?)))
}
