//! `musonic-server`: the server with the providers shipped in this repository.

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    musonic_server::init_tracing();
    let config = musonic_server::config::Config::load()?;
    musonic_server::run(config, Default::default()).await
}
