# Changelog — Musonic Web

All notable changes to the web client are documented in this file.
Releases are tagged `web-vX.Y.Z`.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Security
- **On a Musonic Server, the browser keeps a device key instead of a token made from your password.** The password is used once at sign-in; the key, named after the browser, is listed in the server's console and can be revoked there. Other Subsonic servers keep the token as before.

### Changed
- **Edit a playlist in place** — “Edit” turns the page into its edit mode: the name and description become fields, each song gets a handle to drag it to a new place (or the up and down arrow keys) and a “−” to remove it; “Done” saves everything at once, Escape or “Cancel” drops the changes. It replaces the name and description dialog.
- **Log out revokes the browser's key** on a Musonic Server.

### Fixed
- **A refused account goes back to the sign-in form with the reason** (key revoked, account suspended, password changed) instead of showing errors and an empty library.

### Added
- **Import a Spotify or Deezer playlist** (Library → Import, on a Musonic Server): paste the playlist's address, check its name, cover and songs, and Musonic makes it again with songs from your library and the online catalog. The import runs on the server (you can close the window) with its progress shown live, then a report lists the songs not found and the uncertain ones (a close version used instead). A Spotify playlist is read up to its first 100 songs; for the rest, put them in a second Spotify playlist and paste its address in the report: its songs are added to the same playlist. The report can look for the missing songs again. The report stays available from the playlist's page.

### Fixed
- **Plays are now counted.** The web client never told the server what you listened to, so "Recently played", "Most played" and the top songs stayed empty. A track counts once you have really listened to half of it (or 4 minutes, tracks under 30 s never count): skipping to the end does not count. The track also shows as "now playing" while it plays, and the home picks up the new plays on your next visit.
- Liking an online track, or adding it to a playlist, now works: the track is first imported into your library (a message tells you while it downloads), then liked or added under its library id. Before, the server could not find it and nothing happened.

## [1.0.0] - 2026-10-19

The first complete release of Musonic in the browser, made for desktop. Use it online at https://doodzprog.github.io/Musonic/app/ or host it yourself with `Musonic-Web.zip`.

### Added
- **Sign-in** to Navidrome or any Subsonic-compatible server with token authentication: the password is never sent in clear. **Remember me** keeps you signed in on your own computer, after a clear warning about the token stored in the browser.
- **Home** like the mobile app: quick access, recently played, favourite artists, “More like…”, “Because you liked…”, Magic Mixes, rediscover, new in your library, random.
- **Library**: playlists with Liked Songs and My Music, albums, artists, and **Play by genre**.
- **Search** in your library with Songs / Albums / Artists filters and endless results, plus **Browse**: recently added, most played, random and one tile per decade.
- **Magic Mixes**: eight mixes a day from your favourite genres, each with its own page like a playlist.
- **Playback engine shared with the mobile app**: shuffle off / on / Magic, repeat all / one, autoplay, previous restarts after 3 s; Space and Ctrl + arrows; media keys and the desktop media controls.
- **Queue** panel in zones (now playing, added by you, next up, autoplay): play from any entry, remove, **reorder by drag and drop**.
- **Synced lyrics**: from the server, else from LRCLIB; the line being sung is highlighted and a click jumps to it.
- **Full-screen player**: blurred cover background, large cover, lyrics beside it, like, controls and volume, and the browser’s full screen.
- **Floating mini player**: a Picture-in-Picture window (Brave, Chrome, Edge) that stays on top of everything, even when the tab is hidden or the browser minimized. Its layout follows its size, from one thin line to a large view with like and the next track.
- **Track rows**: a heart for liked songs and a “+” / “✓” showing at a glance whether the song is in one of your playlists. Right click or “⋯” for play next, add to queue, add to a playlist, like, go to the album or the artist.
- **Add to a playlist** box with the covers and track counts; it also removes the song from a playlist.
- **Playlists**: create, edit the name and description (synced with every client), delete. The sidebar lists the most recently played first, with a play button on hover.
- **Resizable side panels**: drag the edge, double-click to reset.
- **English and French**: the browser language by default, your choice remembered and shared with the Musonic website. Settings in the profile menu, at the top right.
- **Self-hosting**: `Musonic-Web.zip` in every `web-v` release, with a short guide.
