# Musonic Server

The music server of the Musonic ecosystem: your library, your accounts and your playlists, for
the Musonic apps and for any Subsonic client.

> **Status: in development (0.1.0).** Scanning, accounts, browsing, search, playback with
> transcoding, covers, lyrics, likes, ratings, play counts, playlists and the saved play queue
> work; online tracks and the import from Navidrome come next.
> Use [Navidrome](https://www.navidrome.org/) in the meantime.

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
Requires Rust 1.88 or later. [ffmpeg](https://ffmpeg.org/) is needed to transcode (lower bit
rates on mobile data); without it, files are sent as they are. `MUSONIC_FFMPEG` sets its path.

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
| `scan_interval_minutes` (0 = only on changes) | `MUSONIC_SCAN_INTERVAL_MINUTES` | `60` |
| `legacy_auth`: Subsonic token sign-in (`t` + `s`) | `MUSONIC_LEGACY_AUTH` | `true` |
| Key encrypting the passwords kept for `legacy_auth` (64 hex) | `MUSONIC_SECRET_KEY` | `secret.key` in `data_dir`, created on first start |

`musonic-server scan [--full]` scans the library once and prints a summary.

### First start
Create the administrator account, either from a client (`POST /v1/setup`, allowed only while
there is no account) or on the command line:

```sh
musonic-server user add <name> --admin   # asks for the password (or MUSONIC_PASSWORD)
```

Clients sign in with a username and password, or better with a per-device API key
(`POST /v1/me/api-keys`, OpenSubsonic `apiKey`). Without `legacy_auth`, only the password is
needed to check sign-ins and nothing reversible is stored; with it (default, needed by many
Subsonic clients), the password is also kept encrypted with a key outside the database.
Keep `data_dir` private and backed up.

## Development
```sh
cargo test
cargo clippy --all-targets
cargo fmt --check
```

Layout: `src/db` (SQLite, migrations in `migrations/`), `src/model`, `src/matcher` (matching the
same track across sources), `src/providers` (audio provider interface and conformance checks),
`src/stream` (segment cache), `src/library` (reading tags, scanner, watching, tag writing),
`src/ids.rs` (identifiers), `src/server` (HTTP).

## License
[PolyForm Noncommercial 1.0.0](LICENSE): free to use, study, modify and share for any
noncommercial purpose; selling it or using it commercially is not allowed.
