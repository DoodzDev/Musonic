# Audio providers

An audio provider gives the server audio for tracks it has no file for. The server asks; the
provider answers with a file it can read by byte ranges. Everything else is done by the server:
one id per track, a shared disk cache, import into the library, tags, covers and rescans.

## The contract (`src/providers/mod.rs`)

```rust
#[async_trait]
pub trait AudioProvider: Send + Sync {
    fn id(&self) -> &'static str;
    fn name(&self) -> &'static str { self.id() }
    fn namespace(&self) -> Option<&'static str> { None }
    async fn open(&self, track: &TrackQuery, wanted: Quality) -> Result<Option<RemoteAudio>>;
    fn imports(&self) -> bool { true }
    fn credential(&self) -> Option<&'static str> { None }
    async fn set_credential(&self, value: &str) -> Result<()> { /* not changeable */ }
}
```

- **`id`**: unique, stable identifier of the provider, used in logs, alerts and the API.
- **`name`** (default: the id): the name the administration console shows.
- **`namespace`**: the catalog whose track ids the provider understands. When the server knows the
  track's id in that catalog, it passes it in `TrackQuery::provider_id`. Providers that work from
  metadata only (title, artists, ISRC, duration) return `None`.
- **`open`**: returns the best quality available up to `wanted`.
  - `Ok(Some(audio))`: the file's exact `size`, `format`, `quality` and a `RangeFetcher`.
  - `Ok(None)`: the provider does not have this track; the server tries the next provider.
  - `Err(..)`: something failed (network, authentication…); the server logs it and moves on.
    Return `CredentialsExpired` when the provider's account or key no longer works: the server
    shows an alert (console, and `GET /v1/admin/health`: `"status": "warning"`, `alerts`) until it
    works again.
- **`imports`** (default `true`): whether its files may be imported into the library. A
  provider of previews or excerpts returns `false`.
- **`credential`** (default `None`): when the provider signs in with something an administrator
  may need to renew (an account token, an API key…), the word for it (« Token », « API key »).
  The console then offers to change it.
- **`set_credential`**: receives the new value typed in the console. Check that it works before
  replacing the old one (return an error otherwise: the console shows it), then keep it where
  your provider reads it. The value is never logged nor shown again.

## In the administration console
The « Imports » page lists every provider the server runs, in order, without anything to add
to the console: its `name`, what it does (« full songs and imports » when `imports` is `true`,
« 30-second previews » otherwise), whether it works, and the alert set by `CredentialsExpired`.
When `credential` gives a word, a « Change the … » button opens a form that calls
`set_credential` (`PUT /v1/admin/providers/{id}/credential`).

### Imports
A track without a file that is liked, part of a liked album, or added to a playlist is imported:
downloaded whole from the first provider that may import it, tagged (title, artists, album,
album artist, disc, number, date, ISRC, cover), saved as
`<music folder>/<import_dir>/Album Artist/Album/NN - Title.ext`, then scanned. The scan attaches
the file to the same track, which keeps its likes and playlists. A failed import is tried again
after 5 minutes, 30 minutes, 2 hours and 12 hours, then given up until the track is liked or
added again.

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
(`src/providers/memory.rs`) is the smallest complete example. A binary of your own (a crate
depending on `musonic-server`, with its own `main.rs` calling `musonic_server::cli`) adds its
providers, and its playlist sources (`Extensions::playlist_sources`), without changing this
repository.

## Without writing Rust: relaying another server
A service that already delivers audio through the Subsonic API (another Subsonic server, or a
proxy such as Octo-Fiesta that fetches songs from an online service) can be used as is with the
built-in Subsonic relay: set `subsonic_provider_url`, `subsonic_provider_user` and
`MUSONIC_SUBSONIC_PROVIDER_PASSWORD` (see the README). It appears in the console as « Subsonic
relay », and its songs can be played and imported like any provider's. You are responsible for
the services you connect and for respecting their terms.

## How the server uses them
A track without a file present is played from the first provider, in order, that opens it. Its
stream goes through the segment cache: several listeners share it, players can seek, and it is
freed after 10 minutes without listeners. A provider that fails is logged and skipped.

Order: the providers of the binary, then the configured Subsonic server, then online previews.

## Providers in this repository
- **Subsonic relay** (`SubsonicProvider`): another Subsonic-compatible server (an OctoFiesta in
  front of Navidrome, a Navidrome…). The track is found there by search (ISRC when both know it,
  else title, artists and length) and its file relayed as is. Settings:
  `subsonic_provider_url`, `subsonic_provider_user` and the password in the
  `MUSONIC_SUBSONIC_PROVIDER_PASSWORD` environment variable.
- **Online previews** (`DeezerPreview`): the 30-second preview of an online track, from Deezer's
  public API, when no other provider has the track (`online_previews`, on by default).
- **Memory** (`MemoryProvider`): files held in memory, for tests and as an example.

## Planned
- **Import folder**: any audio file dropped in a watched folder is tagged, filed and added to the
  library.

Use only sources you have the right to use.
