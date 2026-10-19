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
- `/health` endpoint.
