//! HTTP server. For now only `/health`; the Subsonic API (`/rest`) and the native API (`/v1`)
//! come in the next lots.

use axum::{Json, Router, extract::State, routing::get};
use serde_json::{Value, json};

use crate::db::Db;

#[derive(Clone)]
pub struct AppState {
    pub db: Db,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .with_state(state)
}

async fn health(State(state): State<AppState>) -> Json<Value> {
    let schema = state.db.version().await.ok();
    Json(json!({
        "status": if schema.is_some() { "ok" } else { "degraded" },
        "version": env!("CARGO_PKG_VERSION"),
        "schema": schema,
    }))
}

#[cfg(test)]
mod tests {
    use axum::{body::Body, http::Request};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    use super::*;

    #[tokio::test]
    async fn health_reports_version_and_schema() {
        let app = router(AppState {
            db: Db::memory().unwrap(),
        });
        let res = app
            .oneshot(Request::get("/health").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(res.status(), 200);
        let body: Value =
            serde_json::from_slice(&res.into_body().collect().await.unwrap().to_bytes()).unwrap();
        assert_eq!(body["status"], "ok");
        assert_eq!(body["schema"], crate::db::SCHEMA_VERSION);
    }
}
