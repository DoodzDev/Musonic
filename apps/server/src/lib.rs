//! Musonic Server: a music library server for the Musonic apps and any Subsonic client.
//!
//! One canonical id per track, whether the track is a file in the library or only known from
//! an online catalog; audio the library does not have comes from pluggable
//! [`providers`]. A binary starts the server with [`run`], adding its own providers through
//! [`Extensions`].

pub mod config;
pub mod db;
pub mod library;
pub mod matcher;
pub mod model;
pub mod providers;
pub mod server;
pub mod stream;

use std::sync::Arc;

use anyhow::{Context, Result};

use crate::{config::Config, db::Db, providers::AudioProvider};

/// What a binary adds on top of the server.
#[derive(Default)]
pub struct Extensions {
    pub providers: Vec<Arc<dyn AudioProvider>>,
}

pub fn init_tracing() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();
}

pub async fn run(config: Config, ext: Extensions) -> Result<()> {
    std::fs::create_dir_all(&config.data_dir)
        .with_context(|| format!("creating {}", config.data_dir.display()))?;
    let db = Db::open(&config.data_dir.join("musonic.db"))?;
    tracing::info!(
        version = env!("CARGO_PKG_VERSION"),
        schema = db::SCHEMA_VERSION,
        music_dir = ?config.music_dir,
        providers = ?ext.providers.iter().map(|p| p.id()).collect::<Vec<_>>(),
        "musonic-server starting"
    );

    let app = server::router(server::AppState { db });
    let listener = tokio::net::TcpListener::bind(config.bind)
        .await
        .with_context(|| format!("binding {}", config.bind))?;
    tracing::info!("listening on http://{}", config.bind);
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}
