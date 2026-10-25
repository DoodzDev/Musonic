# Changelog — Musonic Mobile

All notable changes to the mobile app (Android, iOS) are documented in this file.
Releases are tagged `mobile-vX.Y.Z` (older releases were tagged `vX.Y.Z` and renamed on 2026-10-12).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Security
- **Your password no longer stays on the phone.** On a Musonic Server, signing in now gives this phone its own device key: the password is used once and forgotten, and the key alone goes with each request (no more username and password in the addresses of songs and covers). The key is listed in the server's console, where it can be revoked. Accounts already saved switch over by themselves at the next launch. On other Subsonic servers the app keeps a sign-in token instead of the password.

### Added
- **Sleep timer** — from the player menu: any length (hours, minutes, seconds), quick presets, or the end of the current track. Playback stops when it runs out.
- **Android Auto: albums, artists and downloads** — browse them from the car screen too, and Musonic starts in Android Auto even when the app was closed.

### Changed
- **Log out really logs out**: it revokes this phone's key and removes the account from the phone; you sign in again with your password.
- **Much smaller app** — the Android download goes from 95 MB to 30 MB (64-bit phones only, unused code and resources removed).
- **My Music opens at once** — the library is kept on the phone and only downloaded again when it changed on the server; the Library tile shows the real number of songs. On a Musonic Server the Home loads in two requests instead of about twenty.
- **Smoother long lists** — album, playlist, artist pages and My Music recycle their rows: far fewer dropped frames while scrolling, less memory.
- **Lighter in the background** — the app no longer redraws or polls the playback position when nothing is on screen: much less battery used with the screen off.
- **The mini player is there from the start** — it shows the last track as soon as the app opens; Back closes the queue first.
- **Black launch screen** instead of a grey flash.

### Removed
- **The optional “Musonic API” setting** — Musonic Server now does what it did (online tracks start fast on their own); its address and key are cleared from the phone.

### Fixed
- **Plays are counted on the time really listened** — half the track (or 4 minutes); skipping to the end no longer counts, the same rule as Musonic Web.
- **Artist pictures** — artists without a picture of their own now show one of their albums instead of an empty image.
- **A refused account no longer leaves the app stuck offline**: when its key was revoked, the account suspended or the password changed, the app goes back to the sign-in screen, filled in, and says why.

## [2.0.1] - 2026-10-17

**Android Auto (beta) and a security fix.** Musonic now shows up in Android Auto, the server credentials no longer reach other apps, and two small player touches.

### Security
- **Credentials no longer reach other apps** — the cover of the playing track was published to the system media session (notification, lock screen) as a server address carrying the account username and password. Apps allowed to read the playing media (notification access, smartwatch companions, Android Auto) could read it. The player now only gets an address internal to Musonic, which reads the cover itself. Changing your Navidrome password after updating is advised.

### Added
- **Android Auto (beta)** — Musonic appears in Android Auto. Browse Library → Playlists with their covers and start a playlist from any track; play / pause, previous / next and seeking work, and the playback screen gets Shuffle (off, on, Magic), Repeat and Like buttons, kept in sync with the phone. Downloaded playlists and tracks show the downloaded badge. Buttons pressed in the car do not vibrate the phone. Not there yet: albums, artists, downloads and Home in the car, voice search, and starting Musonic from the car while it is fully closed. Musonic is not on the Play Store, so Android Auto hides it until **Unknown sources** is turned on in Android Auto's developer settings.
- **Swipe the full player's cover** — left for the next track, right for the previous one, like the mini player. Dragging the player down to close it still works.

### Fixed
- **Mini player tint** — on very colourful covers, the blurred cover behind the mini player stopped in a hard vertical line next to the play button; it now fades out smoothly.

## [2.0.0] - 2026-10-16

**Musonic 2.0 — the new design.** Every screen has been rebuilt on one calm, consistent design: a floating Dock, large titles, grouped lists, softly raised covers and an orange accent kept for what matters. Playback runs on a new engine, Settings gain a Basic and an Advanced mode, and every screen works in landscape.

### Added
- **Dock and landscape Rail** — the bottom tab bar is replaced by a floating glass Dock (Home, Library, Search, mini player); in landscape it becomes a Rail on the side of the screen. The side drawer is gone: your account avatar opens a Profile sheet with accounts, offline mode and settings.
- **New playback engine** — one set of rules for every screen: what you add yourself always plays first and in the order you added it, shuffle and Shuffle Magic never mix it up, the queue and position come back when you reopen the app, "Clear all" can be undone, unplayable tracks are skipped, and offline only downloaded tracks are played. New option: Previous always goes back to the previous track.
- **Swipe to queue** — swipe any track to the right (album, playlist, artist, mix, Liked songs, My music, recommendations, search) to add it to the queue, like on Spotify.
- **Magic Mixes with discoveries** — each genre mix now blends about 3 online discoveries in 10 into your own songs, marked Online.
- **Basic and Advanced settings** — a switch at the top of Settings; the fine-grained options (crossfade, landscape layouts, storage limit) only show in Advanced. New options: date on Home, start tab, haptic feedback and the phone's language.
- **Wi-Fi only downloads** — on by default; on mobile data Musonic asks before downloading, and automatic downloads wait for Wi-Fi.
- **Streaming quality per network** — Original, 320, 192 or 128 kbit/s, set separately for Wi-Fi and mobile data. Downloads always keep the original file.
- **Storage limit** — an Advanced setting caps the space downloads may use (2, 5 or 10 GB).
- **Error states with Retry** — search, artist, Liked songs, My music and recommendations say when the server cannot be reached, with a Retry button, instead of showing an empty list.
- **Landscape everywhere** — every screen has its own landscape layout: two-column detail pages, wide grids, side-by-side player and lyrics.
- **New Home (Design v2)** — date and large title, filters (All, Playlists, Albums, Artists), a 2 × 3 quick access grid, then shelves that change every day: recently played, "For you" (large online cards), artists to discover, **Magic Mixes by genre**, your favorite artists, "More like…", "Because you liked…", rediscover, new in your library, at random. Same engine as Musonic Web. The last Home is kept on the device, so it also shows offline. Covers and cards get a light raised relief (soft shadow and fine light edge). Every card says what it is (Album, Track, Playlist). "Recently played" shows what you really played on the phone (a track played alone, else the album, playlist or mix you launched). The play button of a "For you" card plays the album at once. Magic Mixes open like playlists (shuffle, play, like, add, download).
- **Account avatar at the top left** — on the Home, the avatar moves to the top left and loses its orange glow (same neutral relief as the covers); when scrolling, the title stays on the left next to it, a little larger.
- **New full player (Design v2)** — background made of the cover itself, extremely blurred, kept square and centred behind the cover, fading into a colour of the cover that fills the rest of the screen, and darkened just enough for the text to stay readable (light covers are darkened more), a handle to drag the player down to close it, larger cover that shrinks on pause, round + and ♥ buttons next to the title, a green badge when the track is downloaded, a thin progress bar (tap or drag anywhere to seek), the real audio quality of the track (FLAC, MP3 320…), large play / skip buttons and a bottom row: Lyrics · Shuffle (off, on, Magic) · Repeat · Queue.
- **Lyrics inside the player** — the Lyrics button folds the cover into a small thumbnail and shows the lyrics in its place: the current line is white, the list follows the song (and pauses while you scroll), and a tap on a line jumps to it; the lyrics fade out at the top and bottom. In landscape, the lyrics take the place of the cover.

- **New queue (Design v2)** — the current track at the top (tap to go back to the player), three tiles for Shuffle, Repeat and Autoplay (Autoplay now turns on and off at once), an "Up next" list you can reorder at any time with the handle, and the autoplay suggestions below it. "Edit" selects tracks to play next or remove, or clears everything (with Undo); changes apply at once, "Done" just closes the selection. In landscape, the queue uses two columns: the current track and the tiles on the cover's side, the list over the full height of the other. The non-working sleep timer button is gone.

- **Mini player tinted by the cover** — behind the cover and titles of the mini player, a heavily zoomed, blurred piece of the cover fades into the glass, darkened just enough for the text to stay readable.

- **New Library (Design v2)** — large title, tabs (Playlists, Albums, Artists, Downloaded), the Liked songs and My music tiles on top, a sort line with the item count, list or grid view (remembered), items pinned on top of their tab (remembered), and the "new playlist" button in the header. The Library is kept on the device, so it fills at once on launch and still shows offline.
- **New album, playlist, artist and mix pages (Design v2)** — one shared layout: large cover over a wash of its colour, a bar that shows the title once you scroll, Play (or Pause) and Shuffle buttons, round actions, and the tracks on the shared track row. In landscape, the cover and buttons stay in a column on the left and only the tracks scroll. Albums show the genre, year and real audio quality, Add and Download; playlists keep editing (reorder, remove) with a clear Cancel · Save bar, a search field and online suggestions; artists get a full-width photo, popular tracks, albums and similar artists.
- **New Liked songs and recommendations (Design v2)** — same layout, with Download all, a card to the recommendations and a search field; the recommendations page shows up to 50 online tracks and a button for new suggestions.
- **New My music (Design v2)** — same layout for your whole library, sorted by title, artist or recently added (remembered), with a letter before each section and a sheet to jump straight to a letter. The last list is kept on the phone, so My music opens at once instead of after about two seconds.
- **New Search (Design v2)** — large title and search field, genres of your library to browse (each opens a page with all its songs), then the discovery shelves. While typing: All / My library / Online, a top result, artists and albums as shelves and the songs on the shared track row (like, add to a playlist, download, long press for the menu). Recent searches are fully translated.
- **New Settings (Design v2)** — large title and grouped lists like the rest of the app: each setting explains itself under its name, and the visual choices (progress bar, landscape navigation bar, landscape player) show a small preview. The version shown under "Check for updates" is now the real one.
- **New server connection screen (Design v2)** — the Musonic logo, saved accounts as a list, larger fields that move to the next one with the keyboard, and a short note explaining the risk of a plain HTTP address.
- **Loading placeholders** — album, playlist, artist and mix pages, Liked songs, My music, the Library, the Home and the Search show grey rows and cards shaped like the content while it loads, instead of a spinner.

### Changed
- **Update prompt only for mobile releases** — the app now only looks at `mobile-v…` releases, so a Musonic Web release never triggers an update prompt on the phone.
- **Smoother playlist reordering** — the playlist edit mode now uses the same drag-and-drop list as the queue; removing a song that appears twice only removes the tapped one.
- **French texts use « vous »** everywhere, and English and French texts were reviewed.
- **Calmer now-playing marker** — the bars next to the current track no longer animate: the endless animation tripled the battery use of a list at rest.
- **One icon set for the whole app** — every icon now comes from the shared set (no more slightly different copies of the same icon from screen to screen), and the icons of the option menus are centred on their text.

- **Same haptic feedback everywhere** — liking a track and changing the shuffle or repeat mode now vibrate lightly from every screen, not only from the full player.

- **Search in the library** — the magnifier of the library opens a field that filters your playlists by name as you type (accents and case ignored).

### Fixed
- **Add to queue order** — adding A, B, C then D to the queue now plays them as A, B, C, D (they used to play in reverse order).
- **Play / Pause button of a page** — the main button of an album, playlist, mix or Liked songs now pauses when that list is playing, and only that one.
- **No crash when changing the system font size** — changing Android's text size while a track was paused could close the app.
- **Home after being offline** — the Home reloads by itself when the app is back online.
- **Accessibility** — buttons in menus and dialogs are announced as buttons, and sheet backgrounds read "Close" with TalkBack.
- **Clear connection errors** — a failed connection now says what to fix (wrong username or password, no Subsonic server at this address, server unreachable or too slow, server error) instead of a raw "HTTP 404" or an English server message.
- **Artists credited together** — a track by several artists ("Lil Nas X • Billy Ray Cyrus") no longer creates one unknown artist in the Library and the Home favourite artists: each artist is listed on their own. Names joined with "&" stay whole ("Bigflo & Oli").
- **Wrong artist photo and tracks** — when several Deezer artists share a name, Musonic now picks the best-known one (it used to take the first result, e.g. an unknown namesake instead of the rapper Vald).
- **No quality badge on online tracks** — tracks streamed from the online catalogue no longer show a meaningless quality badge.
- **Liked songs and My music offline** — offline, "Liked songs" lists the downloaded liked tracks and "My music" the downloaded tracks, instead of an empty list. The liked count in the library stays right after starting offline.
- **Playlist covers offline** — the cover of a playlist holding downloaded tracks is kept on the device and shows offline, in the library and on the playlist.
- **Cover art offline** — covers are now saved with downloaded tracks and shown everywhere offline: lists, mini player, full player, notification and lock screen. Covers of tracks downloaded earlier are fetched automatically the next time the server is reachable.

## [1.0.6] - 2026-10-11

### Added
- **Adaptive app icon** — the launcher icon now follows the shape of your launcher (no more white circle on Pixel) and supports Android 13+ themed icons.
- **Launch screen** — Android 12+ now shows the Musonic logo on a dark background at startup instead of the default system icon.

### Changed
- **Full player loads on demand** — the full-screen player is only built when you open it, and lyrics are fetched when it opens (recently opened lyrics are cached).
- **No more audio prefetch of neighbouring tracks** — this prefetch did not speed up playback and forced the server to download the previous and next Deezer tracks.
- **Fewer re-renders** — screens now only react to the settings they actually use.

### Fixed
- **Battery drain with long titles** — a long track title scrolled forever in the mini player, keeping the screen redrawing and roughly doubling CPU use even while paused. It now scrolls once per track.
- **Stuck in offline mode** — a single slow request no longer switches the app offline (three consecutive failures are needed), dead network connections are now detected and dropped, and the app comes back online on its own as soon as the server answers again.
- **Wrong queue after a search** — in Liked Songs, My Music and Recommended tracks, tapping a song after filtering the list now plays the filtered list instead of the full one.
- **Stale titles in confirmations** — liking a track or creating a playlist from the player or a song menu could show or send the title of a previous track.
- **Playlist owner after switching accounts** — the playlist screen now reloads when the active account changes.
- **Rotation** — sheets, the queue, the side menu and the Library grid now follow the screen size after rotating instead of keeping the size measured at launch.
- **Landscape layout** — Library, playlists, Liked Songs, My Music and Recommended tracks no longer draw underneath the side navigation bar; song, album and playlist menus no longer overflow the screen.
- **Queue swipe-to-close** — swiping the queue sheet down from the full player now closes it.

## [1.0.5] - 2026-10-10

### Fixed
- **Lyrics never showing** — LRCLIB (behind Cloudflare) started rejecting requests sent with the default Android HTTP client signature (HTTP 520), so every track fell back to "No lyrics available". Musonic now identifies itself with its own User-Agent.
- **Unsynced lyrics when a synced version exists** — when LRCLIB's best match only has plain text, Musonic now searches other releases of the same track and uses the synced lyrics whose duration matches (±3 s).

## [1.0.4] - 2026-10-10

### Added
- **Landscape navigation** — in landscape, the bottom tab bar becomes a side navigation bar and the mini-player switches to a compact layout.
- **Fullscreen mode** — new toggle in Settings > Display that hides the system status bar (clock, network, battery, notifications) in both orientations; headers move up accordingly.
- **Landscape full player** — new split layout: the cover fills its own column, header/progress/controls/lyrics sit in the other one. Cover side can be swapped in Settings.
- **AlbumDetail compact title** — album title and artist fade into the fixed top bar once the header scrolls away (portrait and landscape).
- **Rotation lock icon** — rotation setting now shows a lock badge when the orientation is locked.
- **Debug build variant** — debug builds use the `com.musonic.debug` package ("Musonic Dev") and install next to the released app; `keystore.properties` is now optional for local builds. Build guide added to `CONTRIBUTING.md`.

### Changed
- **Settings layout** — settings reorganized into captioned card sections.
- **Back buttons** — every screen now uses the same bare chevron.
- **Offline mode** — "beta" label removed.

### Fixed
- **Crossfade volume blip** — the fade-out now starts earlier, so tracks no longer play a brief burst at full volume before the fade-in.
- **Liked Songs header** — back/search row stays fixed instead of scrolling away with the list.
- **Full player cover size after rotation** — cover size is now computed from the current window size instead of a stale value.
- **Waveform preview** — baseline alignment fixed in the Settings preview.

## [1.0.3] - 2026-07-19

### Added
- **My Music** — new pinned Library entry (right after Liked Songs) to browse and play the entire native Navidrome library. Full library fetched once via paginated `search3.view`, filterable by a client-side search bar; Shuffle/Play respect the current search filter.
- **Liked Songs recommendations** — "Recommended tracks" button opens a new screen with up to 50 tracks based on your liked songs (Deezer top tracks of your most-liked artists + Navidrome `getSimilarSongs`), each with like/add-to-playlist/download actions.
- **Liked Songs action icons** — like, add-to-playlist, and download icons added to every row (previously only a 3-dot menu).
- **Liked Songs search** — Spotify-style top search bar (non-sticky), filters the list and syncs with Play.

### Changed
- **Liked Songs header redesign** — cover/heart hero removed from the detail screen (kept on the Library tile); replaced with a plain text title, gradient scoped to just behind the search bar/title, "Recommended tracks" moved into the main action row.

### Fixed
- **Missing Subsonic scrobble** — Musonic now sends `scrobble.view` (now playing + submission) on playback; Navidrome "Recently Played" and the Home recents section finally reflect app usage, not just the web player.
- **Album star silently failing on multi-track `ext-` albums** — `AlbumDetail`'s "+" now imports every unindexed track and resolves the real Navidrome album id before starring, instead of starring the fake `ext-` id and showing a false "added" toast.
- **Audio going silent mid-drive with crossfade enabled** — crossfade's JS-timer-based volume fade could get throttled by Android once the app is backgrounded (e.g. navigation app in foreground), leaving volume stuck at 0 indefinitely while playback kept advancing silently. Crossfade now only runs while the app is foregrounded; a safety net forces full volume if backgrounding happens mid-fade.
- **Per-account cache leakage** — `playlistCacheStore` and `searchHistoryStore` are now cleared and refetched when the active server/account changes, so a second Navidrome account on the same device no longer sees the previous account's playlist-membership hints or search history.
- **"Recommended tracks" navigation crash from Home** — `LikedRecommendations` route was only registered in the Library stack; reaching Liked Songs from the Home tab and tapping the button threw a navigation error.

## [1.0.2] - 2026-05-22

### Added
- **Create playlist from Library** — new `+` button in the Library header opens a modal to create an empty playlist directly from the app.
- **Auto-download** — optional setting (disabled by default) that automatically downloads each played track to the device for offline playback. Enabling shows a confirmation warning about storage and server bandwidth usage.
- **Add ext- tracks to playlist** — Deezer tracks can now be added to playlists via the add-to-playlist sheet; OctoFiesta import is triggered automatically and Navidrome is polled until the native ID is available.
- **iOS app icon** — all required sizes now bundled (20×20 → 1024×1024) for iPhone and iPad; `Contents.json` updated with explicit filenames for every slot.

### Fixed
- **deezerFetch timeout** — all Deezer API calls now use an 8 s `AbortController` timeout, preventing Magic Shuffle and Autoplay from hanging silently on slow CDN responses.
- **Update checker version** — `LOCAL_VERSION` is now read from `package.json` at runtime instead of being hardcoded; the "check for updates" button now compares the correct installed version.
- **Offline shuffle from PlaylistDetail** — pressing Play in PlaylistDetail while Shuffle is active now applies Fisher-Yates ordering before loading the queue; previously the tracks played in order despite the shuffle indicator being lit.
- **Magic Shuffle blocked in offline mode** — cycling the shuffle button in PlaylistDetail while offline no longer reaches the `magic` state; it jumps directly from `on` back to `off`.
- **Offline shuffle in toggleShuffle** — `toggleShuffle` in the player store now resolves local file paths from `downloadStore` before building the RNTP track list, so downloaded tracks are played from the local file when shuffling offline.
- **Pending like spinner** — the heart icon in MiniPlayer and AlbumDetail now shows an `ActivityIndicator` and is disabled while a like operation is in flight, preventing double-taps.
- **toggleLike title/artist forwarding** — `toggleLike` now receives the track title and artist from MiniPlayer, SongOptionsSheet, and AlbumDetail so the ext- import poll can match the correct song.
- **Permanent error list** — `media file not found` and `local track not available` removed from `PERMANENT_ERROR_PATTERNS`; Navidrome returns these transiently before scan completes and `LikeRetryManager` handles retries correctly.
- **Search discover stale data** — switching to offline mode now resets the discover reco state to empty instead of leaving stale online data visible.
- **HTTP URL warning in ServerSetup** — an orange non-blocking warning appears under the URL field when the entered address starts with `http://`.
- **Playlist owner removed** — the hardcoded "Doodz" author line has been removed from PlaylistDetail; only track count and total duration are shown.

## [1.0.1] - 2026-05-20

### Fixed
- **Like/playlist on ext- tracks** — liking or adding a Deezer track to a playlist no longer fails with "not available locally". OctoFiesta import (`stream.view`) is triggered first, then Navidrome is polled up to 75 s for the native ID before starring or adding.
- **Re-like fast path** — navidromeId is now cached in `localImportedIds` after the first successful import; subsequent unlike/re-like operations skip the full import cycle and respond immediately. Stale cache entries are evicted on star failure and fall through to a full import.
- **FSP toast visibility** — "Added to Liked" toast now appears inside the Full-Screen Player modal via a reactive `useEffect` on the `pendingLikeToast` Zustand selector, replacing an unreliable `setTimeout` approach.
- **Toast elevation** — local `Toast` component was missing `elevation: 99` on Android, causing it to render behind elevated FSP elements. Now matches `GlobalToast`.
- **PlaylistDetail like** — `handleToggleLike` in `SongRow` now reads `pendingLikeToast` after `toggleLike` resolves and shows the correct feedback message for ext- tracks.
- **Playlist instant refresh** — after adding a recommendation track the song list is updated immediately without requiring a manual refresh.
- **Recommendation pool** — reco pool expanded to 30 tracks (fetching 15 per artist); always shows 10 tracks, replacing added entries with the next track from the pool automatically. Added tracks are excluded from the pool via title+artist deduplication.
- **PlusCircleIcon design** — icon resized from 24×24 to 26×26 with strokeWidth matching MiniPlayer/FSP inline SVG style for visual consistency.

---

## [1.0.0] - 2026-05-12

### Added
- **Offline mode (Beta)** — manual toggle or auto-detected via connectivity ping; settings store, offline banner, Library and PlaylistDetail adapt to offline state
- **Playlist caching** — `playlistCacheStore` persists playlist metadata and songs for offline access; download progress tracked per track
- **Track downloads** — per-track and per-playlist download to device local storage (Navidrome-indexed tracks only); MMKV-backed persistence survives app restarts
- **Download management** — delete individual downloads or full playlist batches via native confirmation dialogs across FSP, PlaylistDetail, AlbumDetail, and Library screens
- **Storage indicator** in drawer — shows total downloaded music size (Musonic usage only, in Ko/Mo/Go)
- **Autoplay** — automatic queue extension with Deezer + Navidrome similar tracks when queue ends; lock mechanism prevents parallel fetches
- **Shuffle Magic** — genre-aware third shuffle state; inserts Deezer recommendations interleaved with Navidrome tracks; isMagic flag preserved across RNTP queue operations
- **Deezer Recommendations** — Home (album cards), Search Discover (6 sections), PlaylistDetail footer, and ArtistDetail "Dans le même style" section
- **Lucide icon redesign** — all tab icons and action icons replaced with Lucide-sourced SVG variants; mask-based `TrackMagicIcon` and `CheckCircleGreenIcon` added

### Changed
- **Performance** — React.memo on QueueRow, FlashList for long lists, lazy RNTP track insertion (deferred to play time), Set-based selectedIds for edit mode
- **Reanimated migration** — SongOptionsSheet, AlbumOptionsSheet, PlaylistOptionsSheet, AddToPlaylistSheet ported to Reanimated; GestureDetector replaces PanResponder in QueueSheet, DrawerContainer, MiniPlayer, AddToPlaylistSheet handle
- **HTTP client** — `axios` removed; all API calls use native `fetch` with `AbortController` and `URLSearchParams`
- **Deezer in-memory cache** — Promise-based `artistCache` and `albumCache` prevent redundant Deezer lookups within a session
- **Audio Focus** — `RemoteDuck` handler captures playing state before ducking; only resumes if was actually playing (fixes auto-resume after alarm / Instagram / voice assistant)
- **SVG consolidation** — 22 icon components in `src/components/icons/`; inline SVG functions removed from 8 source files

### Removed
- **Dead dependencies** — `react-native-video`, `flash-list`, worklets conflict packages, `@react-native-community/new-app-screen`
- **FSP cover carousel** — swipe gesture and 3-slot carousel removed (Android `<Modal>` + RNGH incompatibility); single `CoverArt` retained with adjacent-track prefetch
- **`axios`** — replaced by native `fetch`

### Known Limitations
- **iOS audio background**: audio cuts when app is backgrounded — `UIBackgroundModes: audio` missing from `Info.plist`
- **iOS Dynamic Island**: `GlobalHeader` uses no safe-area insets; header partially hidden on notched devices
- **FSP swipe**: unavailable on Android due to RNGH + `<Modal>` incompatibility; may be revisited post-v1.0.0
- iOS build is unsigned — install via AltStore or Sideloadly; no App Store distribution planned

---

## [0.9.5] - 2026-05-08

### Added
- **Deezer recommendations in Search** — Discover tab with 6 sections: albums from liked songs, tracks from liked songs, albums from recent listens, 3 "same style" sub-sections each with artist sub-heading, horizontal album row, and track list
- **Deezer recommendations in PlaylistDetail** — footer section fetches top tracks from top 3 playlist artists; single tap plays via OctoFiesta, `+` adds to playlist
- **Deezer recommendations in Home** — Recommendations section now shows Deezer album cards from recent listened artists
- **Deezer recommendations in ArtistDetail** — "Dans le même style" section below Popular Releases; 6 related artists → enrich → deduped album cards
- **Shuffle Magic** — 3-state shuffle cycle (off → on → magic); Magic mode inserts genre-aware Deezer + Navidrome tracks into the queue
- **Autoplay** — automatic similar-track queue extension triggered by PlaybackService on last track

### Fixed
- **Audio Focus** — music no longer auto-resumes after interruptions (Instagram, alarm, Google voice) when it was paused before the interruption

### Changed
- **ArtistDetail top songs** — CoverArt added per song row; index column left-aligned

---

## [0.9.4] - 2026-05-06

### Added
- **Deezer public API** — artist images now fetched via `api.deezer.com/search/artist` (no API key required)
- **CI/CD GitHub Actions** — `android-release.yml` builds a signed release APK on tag push; `ios-release.yml` builds an unsigned IPA for sideloading (AltStore / Sideloadly)
- **Release keystore** — `musonic-release.keystore` (PKCS12, RSA 2048, 10 000 days); keystore path + credentials wired into `android/keystore.properties` and `build.gradle` signing config
- **Screenshots** — 13 S21 Ultra screenshots added to `docs/assets/img/screenshots/` and embedded in README

### Changed
- **Version bump** — `package.json` and `android/app/build.gradle` updated to `1.0.0` (versionCode 11)
- **README** — Last.fm section removed; Deezer integration documented; CI/CD section added; JDK requirement updated to 21; screenshots section added
- **CI workflow** — `android-release.yml` fixed: JDK 17 → 21, keystore filename aligned, `keystore.properties` now written from secrets at build time so Gradle signing config resolves correctly

### Removed
- **Last.fm integration** — `src/api/lastfm.ts` deleted; `LASTFM_API_KEY` removed from `apiKeys.example.ts`; all imports replaced by `src/api/deezer.ts`

---

## [0.9.1] - 2026-05-01

### Fixed
- Playlist bug fixes and artist navigation improvements
- Global documentation pass

---

## [0.9.0] - 2026-04-30

### Added
- Full-text search across songs, artists, and albums
- Offline resilience improvements
- i18n EN/FR support
- CI/CD skeleton

---

## [0.8.0] - 2026-04-27

### Added

#### Player
- Full-screen music player with animated cover art, waveform/classic progress bar toggle
- Mini player with swipe-to-dismiss gesture
- Queue sheet with drag & drop track reordering
- Crossfade support and configurable audio transitions
- Repeat (off / all / one) and shuffle modes
- Like/unlike tracks directly from the player with offline retry queue

#### Playlists
- Create, rename, and delete playlists
- Full playlist editor with drag & drop reordering
- Contextual song options sheet (add to queue, go to album/artist, remove from playlist)
- Add to playlist sheet with inline playlist creation
- Playlist recommendations based on current tracks

#### Library & Browse
- Library screen with albums, playlists, and Liked Songs sections
- Sort options: recently played, recently added, alphabetical, custom
- Liked Songs screen with full song list and playback
- Artist detail screen with cover art, top songs, and discography
- Album detail screen with dominant-color gradient, track listing, and star/unstar

#### Home
- Home screen with filter pills: All, Recent, Frequent, Recommendations, Discover
- Recently played and frequently played sections

#### Search
- Full-text search across songs, artists, and albums
- Dedicated search result screen with grouped sections

#### Navigation & UI
- Bottom tab navigator (Home, Search, Library)
- Animated slide-in drawer for account/settings access
- Settings screen with player style, crossfade duration, mono audio, and rotation lock options
- Offline connectivity banner

#### Infrastructure
- i18n engine: all user-facing strings centralised in `src/i18n/fr.ts`
- MMKV-based persistence for credentials and preferences
- React Native 0.85 with New Architecture (Bridgeless) enabled
