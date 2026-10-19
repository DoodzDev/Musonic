//! `musonic-server`: the server with the providers shipped in this repository.
//!
//! `musonic-server` serves; `musonic-server scan [--full]` scans the library once and prints
//! what it did.

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
        Some(other) => anyhow::bail!("unknown command {other:?} (expected: scan [--full])"),
        None => musonic_server::run(config, Default::default()).await,
    }
}
