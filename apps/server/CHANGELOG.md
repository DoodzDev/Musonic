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
- Subsonic browsing: `getArtists`, `getIndexes`, `getArtist`, `getAlbum`, `getSong`,
  `getMusicDirectory`, `getGenres`, `getAlbumList2` / `getAlbumList` (random, newest, highest,
  frequent, recent, alphabetical, starred, by genre, by year), `getRandomSongs`,
  `getSongsByGenre`, `getStarred2` / `getStarred`, `getTopSongs` (most played here),
  `getSimilarSongs2` (same artists and genres), `getArtistInfo2` (similar artists by genre),
  `getAlbumInfo2`, `getScanStatus`, `startScan`, `getNowPlaying`, `getPlaylists`,
  `getPlaylist`, `getInternetRadioStations` (none); OpenSubsonic fields (several artists,
  album artists, genres, release date, ISRC, sampling rate, bit depth).
- Search (`search3`, `search2`): every word as a prefix, accents ignored; an empty query lists
  everything.
- Playback: `stream` sends the file with HTTP ranges (seeking), or transcodes with ffmpeg when
  a lower bit rate or another format is asked (MP3, Opus, AAC, Vorbis; the file as is when
  ffmpeg is missing); `download`.
- Covers (`getCoverArt`): the album's image file or embedded picture, resized on request
  (JPEG) and cached on disk.
- Lyrics: `getLyricsBySongId` (synced lines from `.lrc` files) and `getLyrics`.
- Likes and ratings: `star` / `unstar` (songs, albums, artists, several at once; liking again
  keeps the first date), `setRating`.
- Plays: `scrobble` counts a play for the song, its album and its artists (with the client's
  date when given), feeding the "frequent" / "recent" lists and top songs; `submission=false`
  shows the song in `getNowPlaying` until it would have ended.
- Playlists: `createPlaylist` (new, or every song replaced, which is how clients reorder),
  `updatePlaylist` (name, comment, public, songs added and removed), `deletePlaylist`; only
  the owner may change them. Positions sent by clients count the songs they see: a song whose
  file is gone stays in place, untouched, and comes back with its file. Song counts and
  durations count the songs shown.
- Saved play queue: `savePlayQueue` / `getPlayQueue` and the OpenSubsonic `…ByIndex` variants
  (`indexBasedQueue` extension), to resume on another device.
- Online catalog, from Deezer's public API (no account, metadata only; `online`, on by
  default): `search3` / `search2` add online songs, albums and artists after the library's
  (first page, nothing shown twice); `getSong`, `getAlbum`, `getArtist` and `getCoverArt` open
  online items (`dz-track-…`, `dz-album-…`, `dz-artist-…` ids). Answers are cached and requests
  kept under the API's limit.
- Online songs liked, rated, played, queued or added to a playlist are stored as library tracks
  without a file, under a library id (or linked to the library track of the same recording:
  ISRC, else title, artists and length). Their album and artist pages open, with their covers.
  They show in likes, playlists and the queue, not in the library lists until their file is
  imported; the imported file then joins the same track, which keeps its likes and playlists.
- Songs without a file play from audio providers, tried in order, through the shared segment
  cache (seeking works, several listeners share one stream, idle streams are freed). Included:
  a relay to another Subsonic server (an OctoFiesta, a Navidrome: found by ISRC, else title,
  artists and length) and, last, the 30-second online preview.
- Imports: an online song liked, part of a liked album or added to a playlist is downloaded in
  the background from a provider whose files may be imported (never a preview), tagged, filed
  in `<music folder>/Musonic/Album Artist/Album/NN - Title.ext` and scanned: it joins the same
  track, which keeps its likes and playlists. Failed imports are tried again (5 min, 30 min,
  2 h, 12 h), then given up until asked again. Settings: `import`, `import_dir`,
  `import_quality`. `/health` counts them.
- Online albums and artists can be liked whole (`albumId` / `artistId` with `dz-…` ids): a
  liked album's songs are imported; liked albums and artists known only online show in the
  likes.
- `musonic-server import-navidrome <copy of navidrome.db>`: playlists, likes, ratings, play
  counts and plays of the accounts that exist here (same user name), tracks matched by their
  file (then ignoring case and accents); tracks and playlists keep their Navidrome ids
  (`--new-ids` otherwise), albums and artists get ids from their tags. Safe to run again
  (`--replace-playlists` to import playlists again). Tested on a real library: 15 playlists,
  432 entries, 2 858 plays, in about a second.
- Daily database backup (consistent copy while running) in `data_dir/backups`, 14 days kept
  (`backup_days`).
- `Dockerfile` (with ffmpeg) and `compose.example.yml`.
- A music folder that moved (another disk, another Docker mount) is followed: tracks, likes and
  playlists stay, files are found in the new place.
- `musonic_server::cli`: the command line, for binaries that add their own providers.
- Providers can say their credentials expired: `/health` then shows `"status": "warning"` and
  the provider in `alerts`.
- Tracks without an album artist tag: the album goes to the main artist ("A feat. B" → "A").
