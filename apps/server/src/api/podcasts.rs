//! « Podcasts » settings of the console (ADR-023): the Podcast Index key, which adds searches by
//! person and the shows the iTunes directory misses.
//!
//! | Route | |
//! |---|---|
//! | `GET /v1/admin/podcasts` | `{indexConfigured, shows, episodes}` |
//! | `PUT /v1/admin/podcasts/index` | `{key, secret}`: tested, then kept (empty: removed) |

use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    routing::{get, put},
};
use serde::Deserialize;
use serde_json::json;

use super::{ApiError, Auth, Reply};
use crate::{journal::Entry, server::AppState};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/v1/admin/podcasts", get(status))
        .route("/v1/admin/podcasts/index", put(set_index))
}

fn admin(auth: &Auth) -> Result<(), ApiError> {
    if auth.user.is_admin {
        Ok(())
    } else {
        Err(ApiError::forbidden())
    }
}

async fn status(State(state): State<AppState>, auth: Auth) -> Reply {
    admin(&auth)?;
    let (shows, episodes): (i64, i64) = state
        .db
        .call(|c| {
            Ok(c.query_row(
                "SELECT (SELECT count(*) FROM podcast WHERE EXISTS
                           (SELECT 1 FROM podcast_subscription s WHERE s.podcast_id = podcast.id)),
                        (SELECT count(*) FROM episode)",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )?)
        })
        .await?;
    Ok(Json(
        json!({ "indexConfigured": state.podcasts.has_index(), "shows": shows, "episodes": episodes }),
    ))
}

#[derive(Deserialize)]
struct IndexKey {
    key: String,
    secret: String,
}

async fn set_index(State(state): State<AppState>, auth: Auth, Json(body): Json<IndexKey>) -> Reply {
    admin(&auth)?;
    if let Err(e) = state.podcasts.set_index(&body.key, &body.secret).await {
        tracing::warn!("Podcast Index key refused: {e:#}");
        return Err(ApiError(
            StatusCode::UNPROCESSABLE_ENTITY,
            "refused by Podcast Index".into(),
        ));
    }
    state
        .journal
        .log(Entry::new("podcasts.index").by_admin(&auth.user.username));
    Ok(Json(
        json!({ "indexConfigured": state.podcasts.has_index() }),
    ))
}
