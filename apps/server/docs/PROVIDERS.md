# Audio providers

An audio provider gives the server audio for tracks it has no file for. The server asks; the
provider answers with a file it can read by byte ranges. Everything else is done by the server:
one id per track, a shared disk cache, import into the library, tags, covers and rescans.

## The contract (`src/providers/mod.rs`)

```rust
#[async_trait]
pub trait AudioProvider: Send + Sync {
    fn id(&self) -> &'static str;
    fn namespace(&self) -> Option<&'static str> { None }
    async fn open(&self, track: &TrackQuery, wanted: Quality) -> Result<Option<RemoteAudio>>;
}
```

- **`id`**: unique name of the provider, shown in logs and settings.
- **`namespace`**: the catalog whose track ids the provider understands. When the server knows the
  track's id in that catalog, it passes it in `TrackQuery::provider_id`. Providers that work from
  metadata only (title, artists, ISRC, duration) return `None`.
- **`open`**: returns the best quality available up to `wanted`.
  - `Ok(Some(audio))`: the file's exact `size`, `format`, `quality` and a `RangeFetcher`.
  - `Ok(None)`: the provider does not have this track; the server tries the next provider.
  - `Err(..)`: something failed (network, authentication…); the server logs it and moves on.

```rust
#[async_trait]
pub trait RangeFetcher: Send + Sync {
    async fn fetch(&self, start: u64, end: u64) -> Result<Bytes>; // `end` inclusive
}
```

The server reads 1 MiB segments (`stream::SEGMENT_SIZE`), the last one clamped to the file size,
and caches each segment once whatever the number of listeners. `fetch` must return exactly
`end - start + 1` bytes of playable audio, the same bytes every time.

## Checking a provider

Every provider should pass the conformance checks:

```rust
let report = musonic_server::providers::conformance::check(&provider, &known, &unknown).await?;
assert!(report.passed(), "{report}");
```

They check that an unknown track gives `Ok(None)`, that a known one opens with a non-zero size,
that the first and last segments have the exact length, and that a range reads the same twice.

## Plugging a provider in

Providers are Rust values passed to the server by the binary that starts it:

```rust
let ext = musonic_server::Extensions { providers: vec![Arc::new(MyProvider::new()?)] };
musonic_server::run(config, ext).await
```

The default binary (`src/main.rs`) ships the providers of this repository. `MemoryProvider`
(`src/providers/memory.rs`) is the smallest complete example.

## Providers planned in this repository
- **Import folder**: any audio file dropped in a watched folder is tagged, filed and added to the
  library.
- **Direct URL**: a file served over HTTP(S) with range requests.
- **Subsonic upstream**: another Subsonic-compatible server used as a source.

Use only sources you have the right to use.
