//! Musonic Server: a music library server for the Musonic apps and any Subsonic client.
//!
//! One canonical id per track, whether the track is a file in the library or only known from
//! an online catalog; audio the library does not have comes from pluggable
//! [`providers`]. A binary starts the server with [`run`], adding its own providers through
//! [`Extensions`].

pub mod api;
pub mod config;
pub mod db;
pub mod events;
pub mod ids;
pub mod journal;
pub mod library;
pub mod logs;
pub mod matcher;
pub mod metrics;
pub mod model;
pub mod online;
pub mod playlist_import;
pub mod providers;
pub mod remote;
pub mod server;
pub mod settings;
pub mod stream;
pub mod subsonic;
pub mod users;
pub mod webapp;

#[cfg(test)]
mod testing;

use std::{net::SocketAddr, sync::Arc, time::Duration};

use anyhow::{Context, Result};

use crate::{
    config::Config,
    db::Db,
    library::{LibraryService, ScanStats, Scanner},
    providers::AudioProvider,
    users::{Users, secret::SecretBox},
};

/// What a binary adds on top of the server.
#[derive(Default)]
pub struct Extensions {
    pub providers: Vec<Arc<dyn AudioProvider>>,
    /// Services playlists can be imported from, besides Deezer (ADR-020).
    pub playlist_sources: Vec<Arc<dyn playlist_import::PlaylistSource>>,
}

/// The command line of a server binary, `extensions` giving its own providers:
/// `<binary>` serves; `<binary> scan [--full]` scans the library once and prints what it did;
/// `<binary> user add <name> [--admin]` creates an account (password from `MUSONIC_PASSWORD`
/// or typed in); `<binary> import-navidrome <navidrome.db> [--replace-playlists] [--new-ids]`
/// imports playlists, likes and plays from a copy of a Navidrome database (see
/// [`library::navidrome`]).
pub async fn cli(extensions: impl FnOnce(&Config) -> Result<Extensions>) -> Result<()> {
    init_tracing();
    let config = Config::load()?;
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("scan") => {
            let full = args.iter().any(|a| a == "--full");
            let stats = scan_once(config, full).await?;
            println!("{}", serde_json::to_string_pretty(&stats)?);
            Ok(())
        }
        Some("user") if args.get(1).map(String::as_str) == Some("add") => {
            let name = args
                .get(2)
                .filter(|n| !n.starts_with("--"))
                .ok_or_else(|| anyhow::anyhow!("usage: user add <name> [--admin]"))?;
            add_user(config, name, args.iter().any(|a| a == "--admin")).await
        }
        Some("import-navidrome") => {
            let path = args
                .get(1)
                .filter(|p| !p.starts_with("--"))
                .ok_or_else(|| {
                    anyhow::anyhow!(
                        "usage: import-navidrome <navidrome.db> [--replace-playlists] [--new-ids]"
                    )
                })?;
            let opts = library::navidrome::NavidromeOptions {
                keep_ids: !args.iter().any(|a| a == "--new-ids"),
                replace_playlists: args.iter().any(|a| a == "--replace-playlists"),
            };
            let report = import_navidrome(config, path.into(), opts).await?;
            println!("{}", serde_json::to_string_pretty(&report)?);
            Ok(())
        }
        Some(other) => {
            anyhow::bail!(
                "unknown command {other:?} (expected: scan [--full], user add <name> [--admin], \
                 import-navidrome <navidrome.db>)"
            )
        }
        None => {
            let ext = extensions(&config)?;
            run(config, ext).await
        }
    }
}

pub fn init_tracing() {
    use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
    tracing_subscriber::registry()
        .with(
            // lofty warns about every file it estimates the duration of.
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,lofty=error".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        // The last lines, for the console.
        .with(
            tracing_subscriber::fmt::layer()
                .with_ansi(false)
                .with_writer(logs::Memory),
        )
        .init();
}

pub async fn run(mut config: Config, mut ext: Extensions) -> Result<()> {
    std::fs::create_dir_all(&config.data_dir)
        .with_context(|| format!("creating {}", config.data_dir.display()))?;
    let db = Db::open(&config.data_dir.join("musonic.db"))?;
    // Settings changed in the console go over the configuration.
    config = db
        .call(move |c| {
            settings::apply(c, &mut config)?;
            Ok(config)
        })
        .await?;
    tracing::info!(
        version = env!("CARGO_PKG_VERSION"),
        schema = db::SCHEMA_VERSION,
        music_dir = ?config.music_dir,
        providers = ?ext.providers.iter().map(|p| p.id()).collect::<Vec<_>>(),
        "musonic-server starting"
    );

    let library = match &config.music_dir {
        Some(root) => {
            let scanner = Scanner::new(db.clone(), root.clone()).await?;
            let every = (config.scan_interval_minutes > 0)
                .then(|| Duration::from_secs(config.scan_interval_minutes * 60));
            Some(LibraryService::start(scanner, root.clone(), every))
        }
        None => None,
    };

    let users = open_users(&config, db.clone())?;
    if users.count().await? == 0 {
        tracing::warn!(
            "no account yet: create the administrator in the web client, with POST /v1/setup, \
             or with `musonic-server user add <name> --admin`"
        );
    }
    let mut state = server::AppState::new(db, library, users, config.data_dir.clone());
    state.journal = journal::Journal::open(&config.data_dir.join("events.db"))
        .context("opening the journal (events.db)")?;
    state.journal.load_settings(&state.db).await?;
    state.journal.maintain();
    state
        .journal
        .log(journal::Entry::new("server.start").detail(env!("CARGO_PKG_VERSION")));
    state.provider_health = Arc::new(providers::ProviderHealth::with_journal(
        state.journal.clone(),
    ));
    state.settings_now = Arc::new(settings::of(&config));
    state.admin_dir = admin_dir(&config);
    state.music_dir = config.music_dir.clone();
    state.import_dir = config.import_dir.clone();
    state.metrics = Some(metrics::Metrics::start(metrics::Options {
        db: Some(state.db.clone()),
        data_dir: config.data_dir.clone(),
        music_dir: config.music_dir.clone(),
        check_releases: config.update_check,
        host_net_dev: config.host_net_dev.clone(),
    }));
    match &state.admin_dir {
        Some(d) => tracing::info!("administration console: {}", d.display()),
        None => tracing::info!("no administration console installed"),
    }
    if config.online {
        state.online = Some(Arc::new(online::Deezer::new(&config.deezer_api_url)?));
    }
    let mut sources = std::mem::take(&mut ext.playlist_sources);
    if let Some(dz) = &state.online {
        sources.push(Arc::new(playlist_import::DeezerPlaylists::new(dz.clone())));
    }
    tracing::info!(
        sources = ?sources.iter().map(|s| s.id()).collect::<Vec<_>>(),
        "playlist import sources"
    );
    state.playlist_sources = Arc::new(sources);
    state.providers = Arc::new(providers(&config, ext, state.online.clone())?);
    // Credentials set in the console (checked online: in the background).
    {
        let state = state.clone();
        tokio::spawn(async move { api::restore_credentials(&state).await });
    }
    tracing::info!(
        providers = ?state.providers.iter().map(|p| p.id()).collect::<Vec<_>>(),
        "audio providers"
    );
    // Streams nobody listens to any more free their disk space.
    if let (true, Some(root)) = (config.import, &config.music_dir)
        && state.providers.iter().any(|p| p.imports())
    {
        let quality = model::Quality::parse(&config.import_quality)
            .with_context(|| format!("import_quality: {}", config.import_quality))?;
        state.imports = Some(
            library::import::Importer {
                db: state.db.clone(),
                remote: state.remote(),
                root: root.clone(),
                dir: config.import_dir.clone(),
                quality,
                library: state.library.clone(),
                http: reqwest::Client::new(),
                events: Some(state.events.clone()),
                journal: Some(state.journal.clone()),
            }
            .start(),
        );
    }
    if config.backup_days > 0 {
        let (db, dir, days, journal) = (
            state.db.clone(),
            config.data_dir.join("backups"),
            config.backup_days,
            state.journal.clone(),
        );
        tokio::spawn(async move {
            let mut every = tokio::time::interval(Duration::from_secs(24 * 3600));
            loop {
                every.tick().await;
                match db.daily_backup(&dir, days).await {
                    Ok(p) => {
                        tracing::info!("database backed up to {}", p.display());
                        let size = std::fs::metadata(&p).map(|m| m.len()).unwrap_or_default();
                        journal.log(journal::Entry::new("backup.done").detail(size));
                    }
                    Err(e) => {
                        tracing::error!("database backup: {e:#}");
                        journal.log(journal::Entry::new("backup.failed"));
                    }
                }
            }
        });
    }
    playlist_import::PlaylistImports::start(state.clone());
    let sessions = state.sessions.clone();
    tokio::spawn(async move {
        let mut every = tokio::time::interval(Duration::from_secs(300));
        loop {
            every.tick().await;
            sessions.evict_idle().await;
        }
    });
    let app = server::router(state);
    let listener = tokio::net::TcpListener::bind(config.bind)
        .await
        .with_context(|| format!("binding {}", config.bind))?;
    tracing::info!("listening on http://{}", config.bind);
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(async {
        let _ = tokio::signal::ctrl_c().await;
    })
    .await?;
    Ok(())
}

/// Where the built administration console is: the setting, else next to the binary, else the
/// usual system place.
fn admin_dir(config: &Config) -> Option<std::path::PathBuf> {
    let next_to_binary = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join("admin")));
    config
        .admin_dir
        .clone()
        .into_iter()
        .chain(next_to_binary)
        .chain([std::path::PathBuf::from("/usr/share/musonic/admin")])
        .find(|d| d.join("index.html").is_file())
}

/// Providers in the order they are tried: the binary's own, the configured Subsonic server,
/// then online previews.
fn providers(
    config: &Config,
    ext: Extensions,
    online: Option<Arc<online::Deezer>>,
) -> Result<Vec<Arc<dyn AudioProvider>>> {
    let mut all = ext.providers;
    if let Some(url) = &config.subsonic_provider_url {
        let user = config
            .subsonic_provider_user
            .as_deref()
            .context("subsonic_provider_url needs subsonic_provider_user")?;
        let password = std::env::var("MUSONIC_SUBSONIC_PROVIDER_PASSWORD")
            .context("subsonic_provider_url needs MUSONIC_SUBSONIC_PROVIDER_PASSWORD")?;
        all.push(Arc::new(providers::SubsonicProvider::new(
            url, user, &password,
        )?));
    }
    if let Some(dz) = online.filter(|_| config.online_previews) {
        all.push(Arc::new(providers::DeezerPreview::new(dz)));
    }
    Ok(all)
}

/// Imports from a copy of a Navidrome database (scan the library first: tracks are matched by
/// their files).
pub async fn import_navidrome(
    config: Config,
    path: std::path::PathBuf,
    opts: library::navidrome::NavidromeOptions,
) -> Result<library::navidrome::NavidromeReport> {
    std::fs::create_dir_all(&config.data_dir)?;
    let db = Db::open(&config.data_dir.join("musonic.db"))?;
    db.call(move |c| library::navidrome::import(c, &path, opts))
        .await
}

/// One scan of the library, then exit (`musonic-server scan [--full]`).
pub async fn scan_once(config: Config, full: bool) -> Result<ScanStats> {
    let root = config
        .music_dir
        .clone()
        .context("no music folder configured (MUSONIC_MUSIC_DIR)")?;
    std::fs::create_dir_all(&config.data_dir)?;
    let db = Db::open(&config.data_dir.join("musonic.db"))?;
    Scanner::new(db, root).await?.scan(full).await
}

fn open_users(config: &Config, db: Db) -> Result<Users> {
    let key = std::env::var("MUSONIC_SECRET_KEY").ok();
    let secrets = SecretBox::load(
        key.as_deref().filter(|k| !k.trim().is_empty()),
        &config.data_dir,
    )?;
    Ok(Users::new(db, secrets, config.legacy_auth))
}

/// `musonic-server user add <name> [--admin]`, password from `MUSONIC_PASSWORD` or stdin.
pub async fn add_user(config: Config, username: &str, admin: bool) -> Result<()> {
    std::fs::create_dir_all(&config.data_dir)?;
    let db = Db::open(&config.data_dir.join("musonic.db"))?;
    let password = match std::env::var("MUSONIC_PASSWORD") {
        Ok(p) if !p.is_empty() => p,
        _ => {
            eprint!("Password for {username}: ");
            let mut line = String::new();
            std::io::stdin().read_line(&mut line)?;
            line.trim_end_matches(['\r', '\n']).to_owned()
        }
    };
    let user = open_users(&config, db)?
        .create(username, &password, admin)
        .await?;
    println!(
        "created {} ({})",
        user.username,
        if user.is_admin {
            "administrator"
        } else {
            "user"
        }
    );
    Ok(())
}
