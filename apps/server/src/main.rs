//! `musonic-server`: the server with the providers shipped in this repository.
//!
//! `musonic-server` serves; `musonic-server scan [--full]` scans the library once and prints
//! what it did; `musonic-server user add <name> [--admin]` creates an account (password from
//! `MUSONIC_PASSWORD` or typed in).

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    musonic_server::init_tracing();
    let config = musonic_server::config::Config::load()?;
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("scan") => {
            let full = args.iter().any(|a| a == "--full");
            let stats = musonic_server::scan_once(config, full).await?;
            println!("{}", serde_json::to_string_pretty(&stats)?);
            Ok(())
        }
        Some("user") if args.get(1).map(String::as_str) == Some("add") => {
            let name = args
                .get(2)
                .filter(|n| !n.starts_with("--"))
                .ok_or_else(|| {
                    anyhow::anyhow!("usage: musonic-server user add <name> [--admin]")
                })?;
            musonic_server::add_user(config, name, args.iter().any(|a| a == "--admin")).await
        }
        Some(other) => {
            anyhow::bail!(
                "unknown command {other:?} (expected: scan [--full], user add <name> [--admin])"
            )
        }
        None => musonic_server::run(config, Default::default()).await,
    }
}
