# Musonic Server

The music server of the Musonic ecosystem: your library, your accounts and your playlists, for
the Musonic apps and for any Subsonic client.

> **Status: in development (0.1.0).** The structure, the database and the audio provider
> interface are in place; scanning, accounts and the Subsonic API come next. Use
> [Navidrome](https://www.navidrome.org/) in the meantime.

## What it will do
- **Library**: scans your music folder (tags, covers, lyrics, several artists per track), and
  watches it for changes.
- **Subsonic / OpenSubsonic API**: Musonic, Substreamer, Symfonium and other clients work as is.
- **Native API** (`/v1`) used by the Musonic apps, and the Musonic web client served directly.
- **Accounts**: administrators and users, passwords hashed with argon2, one revocable key per
  device.
- **Online catalog**: search and browse artists and albums that are not in your library, and like
  or add them to a playlist right away: every track has a single id, with or without a file.
- **Audio providers**: a documented interface to plug sources of audio for tracks you do not have
  as files (see [docs/PROVIDERS.md](docs/PROVIDERS.md)).

## Build and run
Requires Rust 1.88 or later.

```sh
cargo run --release
# then: curl http://127.0.0.1:4533/health
```

| Setting | Environment | Default |
|---|---|---|
| Configuration file (TOML) | `MUSONIC_CONFIG` | none |
| `bind` | `MUSONIC_BIND` | `127.0.0.1:4533` |
| `data_dir` (database, caches) | `MUSONIC_DATA_DIR` | `data` |
| `music_dir` | `MUSONIC_MUSIC_DIR` | none |

## Development
```sh
cargo test
cargo clippy --all-targets
cargo fmt --check
```

Layout: `src/db` (SQLite, migrations in `migrations/`), `src/model`, `src/matcher` (matching the
same track across sources), `src/providers` (audio provider interface and conformance checks),
`src/stream` (segment cache), `src/library` (tags and file layout), `src/server` (HTTP).

## License
[PolyForm Noncommercial 1.0.0](LICENSE): free to use, study, modify and share for any
noncommercial purpose; selling it or using it commercially is not allowed.
