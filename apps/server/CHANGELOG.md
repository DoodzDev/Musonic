# Changelog — Musonic Server

All notable changes to the server are documented in this file.
Releases will be tagged `server-vX.Y.Z`.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- Project structure, PolyForm Noncommercial 1.0.0 license.
- SQLite database (schema v1) with built-in migrations: canonical tracks with local files and
  online sources, albums, artists with roles, genres, folders, accounts, per-device API keys,
  sessions, per-user likes / ratings / play counts, scrobbles, playlists, saved play queue,
  lyrics cache, accent-insensitive full-text search.
- Audio provider interface with conformance checks and an in-memory example provider.
- Shared segment cache for provider streams, track matching, tag writing (from Musonic API).
- `/health` endpoint, with the state of the last scan.
- Library scanner: reads tags (several artists, composers, genres, dates, ISRC, MusicBrainz
  ids, embedded pictures and lyrics) and audio properties; rescans only the folders that
  changed (folder hash); keeps the track, its likes and playlists when a file moves, is
  duplicated or disappears; attaches an imported file to the track first seen online (ISRC,
  else title + artists + length); picks album covers (`cover.*`, `folder.*`, `front.*`, then
  embedded) and sidecar lyrics (`.lrc`, `.txt`). Tracks without an album go to
  "[Unknown Album]". Misnamed files (AAC in a `.mp3`) are still read.
- Library watching: changes in the music folder are scanned a few seconds later; scheduled
  scan every hour (`MUSONIC_SCAN_INTERVAL_MINUTES`).
- `musonic-server scan [--full]`: scans once and prints what it did.
- Accounts: administrators and users, passwords hashed with argon2id, one revocable API key
  per device (only its hash is stored), sign-in sessions (30 days, sliding), a new password
  ends the other sessions, the last administrator cannot be deleted. Failed sign-ins are
  limited per address and account.
- Subsonic API (`/rest`): sign-in by password (`p`, also `enc:`), legacy token (`t` + `s`, on by
  default, the password then kept encrypted with AES-256-GCM under a key outside the
  database: `MUSONIC_SECRET_KEY` or `secret.key`) and OpenSubsonic API keys; XML, JSON and
  JSONP answers; form posts; `ping`, `getLicense`, `getOpenSubsonicExtensions`, `tokenInfo`,
  `getUser`, `getUsers`, `createUser`, `deleteUser`, `changePassword`, `getMusicFolders`.
- Native API (`/v1`): first administrator (`/v1/setup`), sign-in / sign-out, profile, password,
  device keys, accounts.
- CORS open to any origin (no cookies), for browser clients.
- `musonic-server user add <name> [--admin]`.
