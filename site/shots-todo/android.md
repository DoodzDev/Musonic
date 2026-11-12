# Images to produce — agent `android` (2026-11-11)

Pages: `docs/apps/android`, `docs/apps/sign-in`, `docs/apps/android-auto`, `docs/apps/offline` (EN + FR).
Every picture exists twice: `.en.webp` (phone / app / browser in English) and `.fr.webp` (in French).
Phone shots: Galaxy A52, Android 14, portrait 9:16, Musonic in dark theme, status bar visible. Car shots: 16:9, Android Auto (DHU or real car).
Never show a real password, device key, token or personal address: use `https://music.example.com` (FR `https://music.example.com`) and a demo account.

## apps-android (Install the Android app)

| Path | Kind | Exact state |
|---|---|---|
| `/assets/img/docs/apps-android/01-release-page.<lang>.webp` | github-on-phone | DONE (A52). |
| `/assets/img/docs/apps-android/02-download-warning.<lang>.webp` | phone | DONE (A52). |
| `/assets/img/docs/apps-android/03-download-complete.<lang>.webp` | phone | DONE (A52). |
| `/assets/img/docs/apps-android/04-unknown-apps-blocked.<lang>.webp` | phone | DONE (A52). |
| `/assets/img/docs/apps-android/05-allow-from-source.<lang>.webp` | phone | DONE (A52). |
| `/assets/img/docs/apps-android/06-install.<lang>.webp` | phone | DONE (A52). |
| `/assets/img/docs/apps-android/06b-installing.<lang>.webp` | phone | DONE (A52), used as step 7. |
| ~~`07-play-protect`~~ | — | DROPPED: no Play Protect dialog on the A52; step 8 is text only. |
| `/assets/img/docs/apps-android/08-installed-open.<lang>.webp` | phone | DONE (A52). |
| `/assets/img/docs/apps-android/09-first-launch.<lang>.webp` | phone | DONE (A52). |
| `/assets/img/docs/apps-android/10-update-available.<lang>.webp` | phone | Musonic's alert "Update available" / « Mise à jour disponible », "Version X.Y.Z is available on GitHub.", buttons **Cancel** and **View release** (FR **Annuler**, **Voir la release**). To get it: install an older APK (e.g. mobile-v2.3.0) and launch; it shows ~3 s after launch. |
| `/assets/img/docs/apps-android/11-update-confirm.<lang>.webp` | phone | Installer over an existing Musonic: "Do you want to update this app?", buttons **Cancel** / **Update** (FR **Mettre à jour**). |

## apps-sign-in (Sign in to a server)

| Path | Kind | Exact state |
|---|---|---|
| `/assets/img/docs/apps-sign-in/01-sign-in-empty.<lang>.webp` | phone | Same screen as apps-android/09 (can be the same capture, copied). |
| `/assets/img/docs/apps-sign-in/02-sign-in-filled.<lang>.webp` | phone | Sign-in filled: Server URL `https://music.example.com` (FR `https://music.example.com`), a demo username, password dots, green check + "Connected! Loading…" / « Connecté ! Chargement… » above the button. Keyboard closed. |
| `/assets/img/docs/apps-sign-in/03-invite-page.<lang>.webp` | phone (browser) | Chrome on phone, `<server>/invite/<token>` of a fresh invitation created by an account named **Lea** (the page reads "Lea invites you." / « Lea vous invite. »): logo, "Welcome to Musonic", fields Name, Password, Confirm the password, button **Create my account**, line "Link valid until …, once." Fields empty or Name filled with a demo name. Hide the token in the URL bar (crop or blur). Browser language = page language (the console follows it). |
| `/assets/img/docs/apps-sign-in/04-invite-ready.<lang>.webp` | phone (browser) | After submit: "Your account is ready" / « Votre compte est prêt », the server address box, the line "and sign in with the name and password you just chose." |
| `/assets/img/docs/apps-sign-in/05-profile-logout.<lang>.webp` | phone | Profile sheet open (tap the round avatar at top right of Home): initial avatar, username, server host, **Offline mode** switch, Storage line (if downloads exist), **Settings**, **About**, then **Log out** / **Se déconnecter** in red at the bottom. |

## apps-android-auto (Musonic in the car)

| Path | Kind | Exact state |
|---|---|---|
| `/assets/img/docs/apps-android-auto/01-android-auto-settings.<lang>.webp` | phone | Android Auto settings page on the A52 (Settings → Connected devices → Android Auto), top of the list. |
| `/assets/img/docs/apps-android-auto/02-version.<lang>.webp` | phone | Bottom of the same page, the **Version** line visible (highlight it with a thin orange outline if possible). |
| `/assets/img/docs/apps-android-auto/03-allow-dev-settings.<lang>.webp` | phone | Dialog "Allow development settings?" with **Cancel** / **OK** (only shows if developer mode is off: turn it off first, ⋮ → Quit developer mode). |
| `/assets/img/docs/apps-android-auto/04-developer-menu.<lang>.webp` | phone | ⋮ menu open at top right, item **Developer settings** / **Paramètres pour les développeurs** visible. Adjust the page text if the real FR label differs. |
| `/assets/img/docs/apps-android-auto/05-unknown-sources.<lang>.webp` | phone | Developer settings, **Unknown sources** / **Sources inconnues** checkbox ticked. |
| `/assets/img/docs/apps-android-auto/06-car-launcher.<lang>.webp` | car (16:9) | Android Auto app launcher on the car screen / DHU, Musonic icon among media apps. |
| `/assets/img/docs/apps-android-auto/07-car-home.<lang>.webp` | car (16:9) | Musonic Home tab: tabs Home / Library / Downloaded (FR Accueil / Bibliothèque / Téléchargés), the **Resume** row with a song, **Recently played** cover grid, orange round floating buttons (search magnifier, play). |
| `/assets/img/docs/apps-android-auto/08-car-playlist.<lang>.webp` | car (16:9) | A playlist open: its name in the header, **Play** and **Shuffle** icon buttons at top, song rows, the playing one with orange level bars instead of its cover. |
| `/assets/img/docs/apps-android-auto/09-car-playback.<lang>.webp` | car (16:9) | Playback screen with a music song (not a podcast): cover, title, artist, play/pause, prev/next, Shuffle, Repeat, Like custom buttons, Queue and Lyrics icons in the header. |

## apps-offline (Listen offline)

| Path | Kind | Exact state |
|---|---|---|
| `/assets/img/docs/apps-offline/01-playlist-options.<lang>.webp` | phone | A playlist page with its ⋯ options sheet open, the **Download** / **Télécharger** row visible with the other rows (Add to queue, Pin playlist, Edit playlist…, whatever is really there). Playlist not downloaded yet. |
| `/assets/img/docs/apps-offline/02-download-confirm.<lang>.webp` | phone | Alert "Download playlist?" / « Télécharger la playlist ? » with "Download "<name>" for offline playback? (N songs)", buttons **Cancel** / **Download**. Ideally a playlist of 42 songs named "My playlist" / « Ma playlist » (the page quotes that example). |
| `/assets/img/docs/apps-offline/03-downloading.<lang>.webp` | phone | The same playlist while downloading: some rows with a spinner, others with the green download arrow. On Wi-Fi. |
| `/assets/img/docs/apps-offline/04-settings-quality.<lang>.webp` | phone | Settings, section **Quality and downloads** / **Qualité et téléchargements**: Quality on Wi-Fi = Original (with its hint), Quality on mobile data = 192 (hint), Wi-Fi only ON, Automatic download OFF, Storage limit = No limit with "Used: …". Scroll so all of this fits. |
