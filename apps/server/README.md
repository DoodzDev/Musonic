# Musonic Server

The music server of the Musonic ecosystem: your library, your accounts and your playlists, for
the Musonic apps and for any Subsonic client.

> **Status: in development (0.1.0).** Scanning, accounts, browsing, search, playback with
> transcoding, covers, lyrics, likes, ratings, play counts, playlists, the saved play queue,
> the online catalog and imports work; the import from Navidrome comes next.
> Use [Navidrome](https://www.navidrome.org/) in the meantime.

## What it will do
- **Library**: scans your music folder (tags, covers, lyrics, several artists per track), and
  watches it for changes.
- **Subsonic / OpenSubsonic API**: Musonic, Substreamer, Symfonium and other clients work as is.
- **Native API** (`/v1`) used by the Musonic apps, and the Musonic web client served directly.
  Its types are generated in TypeScript (`packages/core/src/server`).
- **Real-time sync**: every device of an account hears at once what changed (likes,
  playlists, plays, queue, imports) through `GET /v1/events` (WebSocket).
- **Tells clients what it is** (`GET /v1/info`, OpenSubsonic extension `musonicServer`), so a
  client can use its extras and still work with any other Subsonic server.
- **Accounts**: administrators and users, passwords hashed with argon2, one revocable key per
  device.
- **Online catalog** (Deezer's public API, metadata only): search and browse artists and albums
  that are not in your library, and like or add them to a playlist right away: every track has a
  single id, with or without a file, and keeps it once its file is imported.
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
| `online`: online catalog in search and pages | `MUSONIC_ONLINE` | `true` |
| `deezer_api_url` | `MUSONIC_DEEZER_API_URL` | `https://api.deezer.com` |
| `online_previews`: 30-second previews of online songs no provider has | `MUSONIC_ONLINE_PREVIEWS` | `true` |
| `subsonic_provider_url`, `subsonic_provider_user`: Subsonic server to relay audio from | `MUSONIC_SUBSONIC_PROVIDER_URL`, `…_USER` | none |
| Its password (environment only) | `MUSONIC_SUBSONIC_PROVIDER_PASSWORD` | none |
| `import`: import online songs when liked or added to a playlist | `MUSONIC_IMPORT` | `true` |
| `import_dir`: folder of the imports, inside the music folder | `MUSONIC_IMPORT_DIR` | `Musonic` |
| `import_quality`: `mp3_128`, `mp3_320` or `flac` | `MUSONIC_IMPORT_QUALITY` | `mp3_320` |
| `backup_days`: daily database backups kept in `data_dir/backups` (0 = none) | `MUSONIC_BACKUP_DAYS` | `14` |
| `update_check`: look for newer releases on GitHub | `MUSONIC_UPDATE_CHECK` | `true` |
| Key encrypting the passwords kept for `legacy_auth` (64 hex) | `MUSONIC_SECRET_KEY` | `secret.key` in `data_dir`, created on first start |

`musonic-server scan [--full]` scans the library once and prints a summary.

### Docker
`Dockerfile` builds the server, with ffmpeg and its administration console, from the
repository root: `docker build -t musonic-server -f apps/server/Dockerfile .`;
`compose.example.yml` runs it (data and music folders, limits, logs, healthcheck).

### Administration console
Open the server's address in a browser and sign in with an administrator account: accounts,
invitations and password reset links, rights and quotas (see `apps/admin`). It is served from
`admin_dir` (`MUSONIC_ADMIN_DIR`; default: `admin` next to the binary, else
`/usr/share/musonic/admin`); without it, the address shows a short page instead.

### Coming from Navidrome
With the same music folder, and the accounts created here under the same names:

```sh
sqlite3 -readonly /path/to/navidrome.db ".backup navidrome-copy.db"   # a consistent copy
musonic-server scan
musonic-server import-navidrome navidrome-copy.db
```

Playlists, likes, ratings, play counts and plays come over (passwords never do). Tracks are
matched by their file and keep their Navidrome ids, as do playlists, so what clients saved
(downloads, caches) keeps working; `--new-ids` gives them new ones instead. Running it again
adds nothing twice; `--replace-playlists` imports the playlists again.

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
