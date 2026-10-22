# Musonic Server

The music server of the Musonic ecosystem: your library, your accounts and your playlists, for
the Musonic apps and for any Subsonic client.

> **Version 1.0.0.** Install it with Docker (x86 and ARM) or as a single program: see
> [Install](#install). What changed: [CHANGELOG.md](CHANGELOG.md).

## Install
With Docker, in the folder where its data will live:

```sh
curl -o compose.yml https://raw.githubusercontent.com/DoodzProg/Musonic/main/apps/server/compose.example.yml
# set the path of your music folder and its owner (user: "1000:1000"), then:
docker compose up -d
docker compose exec musonic-server musonic-server user add <name> --admin
```

The image is `ghcr.io/doodzprog/musonic-server` (tags `1`, `1.0`, `1.0.0`, `latest`);
`docker compose pull && docker compose up -d` updates it. Put a reverse proxy with HTTPS in
front: the server listens on `127.0.0.1:4533`.

Without Docker: each [release](https://github.com/DoodzProg/Musonic/releases) tagged
`server-v…` has the program for Linux x86 and ARM (`musonic-server-…-linux-x86_64.tar.gz`,
`…-aarch64.tar.gz`), with its console in `admin/` next to it. Install ffmpeg for transcoding.

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
- **Playlist imports**: any account pastes the address of a Deezer playlist (or of another
  service whose playlist source the binary plugs in) and gets it as a Musonic playlist, with a
  report of the songs not found (see [Importing playlists](#importing-playlists)).
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
`compose.example.yml` runs it (data and music folders, limits, logs, healthcheck), from the
published image or, with its `build:` lines, from source.

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

### Importing playlists
`/v1/playlist-imports` (Musonic Web: Library → Import). Each song is looked for in the library
first (ISRC, else title, artists and length), then in the online catalog; songs already in the
library are never downloaded again. The report sorts every song into:

- **found**: the same recording, in the library or online;
- **uncertain**: a close stand-in (another recording of the same work, another length), kept
  in the playlist and listed so you can check it;
- **not found**: listed with the reason; « look for the missing songs again » retries them.

Measured on real playlists (2026-10-21):

| Playlist | Found | Uncertain | Not found |
|---|---|---|---|
| Pop / hits (3 Spotify playlists, 250 songs) | 98 % | 2 % | 0 % |
| Deezer chart (100 songs) | 100 % | 0 % | 0 % |
| Electro swing (33 songs) | 94 % | 0 % | 6 % |
| Classical music (100 songs, French titles) | 73 % | 16 % | 11 % |

In short: **nearly every song** of a pop, rock or electronic playlist is found; for **classical
music**, about **9 songs out of 10** are found or replaced by another recording of the same work,
the rest being titled too differently on the online catalog. A song found online is then
imported as a file like any song put in a playlist; a few can still fail at that step (a song
the provider cannot deliver), which the console's Imports page shows.

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
