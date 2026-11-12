# Screenshots — agent `listening` (apps/listening, apps/import-playlists, apps/podcasts)

Every picture exists twice: `.en.webp` (app / browser in English) and `.fr.webp` (in French).
Phone = Galaxy A52, Android 14, Musonic 2.4.0, portrait 9:16, signed in to a Musonic Server with a
library that has genres, liked songs and a few playlists. Web = Musonic Web 1.2.0 in a Chromium
browser, 16:9, same account. No real person's name, e-mail or private server address visible.

## apps-listening

| Path | Kind | Exact state |
|---|---|---|
| `/assets/img/docs/apps-listening/01-tabs.<lang>.webp` | phone | Home tab, a song playing: mini player visible above the three tabs Home / Search / Library; profile initial and gear visible at the top. |
| `/assets/img/docs/apps-listening/02-web-layout.<lang>.webp` | web | Musonic Web on Home, a song playing: side panel (Home, Search, Library, playlists) on the left, player bar at the bottom, profile at the top right. |
| `/assets/img/docs/apps-listening/03-home.<lang>.webp` | phone | Home scrolled to top: date, large title "Home", chips All / Playlists / Albums / Artists (All selected), the 2×3 quick access grid with Liked Songs first, start of "Recently played". |
| `/assets/img/docs/apps-listening/04-web-home.<lang>.webp` | web | Web Home: Quick access, Recently played, Your favourite artists and a Magic Mixes shelf visible (scroll if needed). |
| `/assets/img/docs/apps-listening/05-search-home.<lang>.webp` | phone | Search tab, field empty: genres of the library and the suggestion shelves below. |
| `/assets/img/docs/apps-listening/06-search-results.<lang>.webp` | phone | Live search for a well-known artist, filter "All": segmented control All / Online / Podcasts, Top result, albums shelf, songs with at least one row showing the "Online" badge. |
| `/assets/img/docs/apps-listening/07-web-search.<lang>.webp` | web | Web search for an artist, filter All selected: chips All / Songs / Albums / Artists / Podcasts, songs list and albums shelf. |
| `/assets/img/docs/apps-listening/08-library.<lang>.webp` | phone | Library tab: tiles Liked Songs and My Music, tabs Playlists / Albums / Artists / Podcasts / Downloaded (Playlists selected), list of playlists, + button at the top right. |
| `/assets/img/docs/apps-listening/09-web-library.<lang>.webp` | web | Web Library on the Playlists tab, buttons "Import" and "New playlist" visible at the top right. |
| `/assets/img/docs/apps-listening/10-full-player.<lang>.webp` | phone | Full player of a song with a colourful cover: title with + and heart, progress bar with quality, controls, bottom row Lyrics · Shuffle · Repeat · Queue. |
| `/assets/img/docs/apps-listening/11-web-full-player.<lang>.webp` | web | Web full-screen player (in-app, not browser full screen) of a song with synced lyrics: cover left, lyrics right, the current line highlighted. |
| `/assets/img/docs/apps-listening/12-queue.<lang>.webp` | phone | Queue sheet: current song at the top, tiles Shuffle / Repeat / Autoplay, "Up next" with handles, dimmed autoplay songs at the bottom (play the last song of an album so autoplay is filled). |
| `/assets/img/docs/apps-listening/13-queue-edit.<lang>.webp` | phone | Queue after tapping "Edit": two rows selected, glass bar "Play next", "Remove (2)", "Clear all" at the bottom. |
| `/assets/img/docs/apps-listening/14-web-queue.<lang>.webp` | web | Web queue panel open on the right with all four sections visible: Now playing, Added by you (add 2 songs with "Add to queue" first), Next up, Autoplay. |
| `/assets/img/docs/apps-listening/15-lyrics.<lang>.webp` | phone | Full player in lyrics mode (compact title row at the top), synced lyrics, current line white, past lines faint. |
| `/assets/img/docs/apps-listening/16-crossfade.<lang>.webp` | phone | Settings, "Playback" group: Autoplay on, Crossfade slider set to 6 s. |
| `/assets/img/docs/apps-listening/17-web-crossfade.<lang>.webp` | web | Web Settings window (profile → Settings): "Crossfade between tracks" slider at 6 s with its hint. |
| `/assets/img/docs/apps-listening/18-sleep-timer.<lang>.webp` | phone | Sleep timer sheet opened from the full player's "⋯": wheels h / min / s, presets 15 30 45 60 90, "End of track". |
| `/assets/img/docs/apps-listening/19-connect-devices.<lang>.webp` | phone | "Listen on" sheet (Devices button of the full player) with "This phone" and one browser tab of Musonic Web open on a computer (rename the web device to "Firefox on PC" / « Firefox sur PC » or any neutral name), Synced playback switch visible. |

## apps-import-playlists

Use a public Deezer playlist of about 80–100 popular songs (a Deezer editorial playlist), so the report shows a few uncertain / not found.

| Path | Kind | Exact state |
|---|---|---|
| `/assets/img/docs/apps-import-playlists/01-copy-link.<lang>.webp` | phone | The Deezer app (in the matching language) on a public playlist, Share sheet open, "Copy link" visible. |
| `/assets/img/docs/apps-import-playlists/02-library-plus.<lang>.webp` | phone | Musonic Library tab, the "+" at the top right circled (add a thin accent circle). |
| `/assets/img/docs/apps-import-playlists/03-new-playlist-dialog.<lang>.webp` | phone | "New playlist" window: name field empty, the row "Import a playlist" with its description below it. |
| `/assets/img/docs/apps-import-playlists/04-paste-link.<lang>.webp` | phone | "Import a playlist" window with the hint text, a `https://link.deezer.com/…` link pasted, "Import" enabled. |
| `/assets/img/docs/apps-import-playlists/05-import-pill.<lang>.webp` | phone | Library while importing: pill "Playlist import: 15/100" (any numbers) under the status bar. |
| `/assets/img/docs/apps-import-playlists/06-imported-playlist.<lang>.webp` | phone | The imported playlist open: name of the original, cover, first songs (some with the Online badge if any). |
| `/assets/img/docs/apps-import-playlists/07-web-import-button.<lang>.webp` | web | Web Library, "Import" button at the top right (highlight it). |
| `/assets/img/docs/apps-import-playlists/08-web-paste.<lang>.webp` | web | "Import a playlist" dialog, address pasted in "Playlist address", button "Read the playlist". |
| `/assets/img/docs/apps-import-playlists/09-web-preview.<lang>.webp` | web | Preview: cover, playlist name, line "Deezer · by … · N songs", field "Name in Musonic", button "Import". |
| `/assets/img/docs/apps-import-playlists/10-web-progress.<lang>.webp` | web | Running import: name, progress bar, "12 / 87 songs", hint "You can close this window…". |
| `/assets/img/docs/apps-import-playlists/11-web-report.<lang>.webp` | web | Finished report: "… songs found", split line (in your library · online · uncertain · not found), "To check" list with Uncertain and Not found tags, buttons "Look for the missing songs again" and "See the playlist". |

## apps-podcasts

Search a well-known public show in the page's language (e.g. a news podcast). If the test server has a Podcast Index key, search a journalist's name so "Episodes with this person" shows.

| Path | Kind | Exact state |
|---|---|---|
| `/assets/img/docs/apps-podcasts/01-search.<lang>.webp` | phone | Live search, "Podcasts" filter selected: shows with covers, then "Episodes with this person". |
| `/assets/img/docs/apps-podcasts/02-web-search.<lang>.webp` | web | Web search, "Podcasts" filter selected: show cards and the episode list. |
| `/assets/img/docs/apps-podcasts/03-show-page.<lang>.webp` | phone | A show's page in the app, not followed yet: cover, author, description, "Follow" button, episodes with dates; one episode showing "… min left". |
| `/assets/img/docs/apps-podcasts/04-library-podcasts.<lang>.webp` | phone | Library on the "Podcasts" tab with 2–3 followed shows. |
| `/assets/img/docs/apps-podcasts/05-episode-player.<lang>.webp` | phone | Full player playing an episode, speed set to 1.5× (button shows "1.5×" / « 1,5× »), −15 and +30 visible. |
| `/assets/img/docs/apps-podcasts/06-web-episode.<lang>.webp` | web | Web player bar playing an episode: −15, +30 and the speed button visible (crop to the bar plus a bit of the page). |

No diagrams on these pages.
