//! `musonic-server`: the server with the providers shipped in this repository (see
//! [`musonic_server::cli`] for the commands).

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    musonic_server::cli(|_| Ok(Default::default())).await
}
