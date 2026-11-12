# Images — agent `library` (pages library/organize, library/scan, library/online-catalogue, library/podcasts)

Console shots: 16:9, browser at 1600×900, console language set to the page language (Settings and maintenance → Console language). Use a test server with a real library (a few hundred songs), never real account names or e-mails of family members: use test accounts (e.g. `alice`, `bob`).

## Diagrams (SVG, one per language, class `diagram`)

### /assets/img/docs/diagrams/library-folder-layout.{en,fr}.svg — kind: diagram
Used in library/organize.
- Left: a folder tree box titled "Music folder" / « Dossier de musique »:
  `Daft Punk/` → `Discovery/` → `cover.jpg`, `01 - One More Time.flac`, `01 - One More Time.lrc`, `02 - Aerodynamic.flac`; `Various Artists/` → `Now Summer 2024/` → `folder.png`, `01 - …`; `Musonic/` (dimmed, label "imports" / « imports »).
- Right: three result boxes: "Album page: Discovery — Daft Punk" / « Page d'album : Discovery — Daft Punk », "Artist page: Daft Punk" / « Page d'artiste : Daft Punk », "Lyrics of One More Time" / « Paroles de One More Time ».
- Arrows: from the .flac files' "tags" label to the album and artist boxes, labelled "tags decide" / « les tags décident »; from `cover.jpg` to the album box, labelled "same folder" / « même dossier »; from the `.lrc` to the lyrics box, labelled "same name" / « même nom ».

### /assets/img/docs/diagrams/library-scan-triggers.{en,fr}.svg — kind: diagram
Used in library/scan.
- Four trigger boxes on the left: "Server start" / « Démarrage du serveur »; "Change in the folder (after 5 s of quiet)" / « Changement dans le dossier (après 5 s de calme) »; "Automatic scan (every 60 min by default)" / « Scan automatique (toutes les 60 min par défaut) »; "Console button / startScan" / « Bouton de la console / startScan ».
- All four arrows go to one box "Scan queue (never two at once)" / « File de scans (jamais deux à la fois) ».
- Then a row of three steps: "Walk the folders (skip unchanged ones)" / « Parcourir les dossiers (sauter ceux inchangés) » → "Read changed files only (full scan: all)" / « Lire seulement les fichiers changés (scan complet : tous) » → "Update songs, albums, artists, covers, lyrics" / « Mettre à jour titres, albums, artistes, pochettes, paroles ».
- Last box: "Database (musonic.db)" / « Base (musonic.db) ».

### /assets/img/docs/diagrams/online-song-lifecycle.{en,fr}.svg — kind: diagram
Used in library/online-catalogue. Four numbered boxes left to right:
1. "Found in search — online, nothing stored" / « Trouvé dans la recherche — en ligne, rien d'enregistré »
2. "Liked / added to a playlist — library song without a file, one id" / « Liké / ajouté à une playlist — titre de la bibliothèque sans fichier, un identifiant »
3. "Imported by an audio provider → Musonic/Album artist/Album/" / « Importé par un fournisseur audio → Musonic/Artiste de l'album/Album/ »
4. "Scanned — the file joins the same song; likes and playlists unchanged" / « Scanné — le fichier rejoint le même titre ; likes et playlists inchangés »
- Arrows 1→2→3→4. From box 2, a dashed side branch down to a box "No provider: plays as a 30-second preview" / « Pas de fournisseur : lu en extrait de 30 secondes ».
- No third-party logos.

### /assets/img/docs/diagrams/podcasts-server.{en,fr}.svg — kind: diagram
Used in library/podcasts.
- Left: "Musonic apps" / « Applis Musonic » (phone + browser icons) ↔ centre box "Musonic Server" (two-way arrow, label "everything goes through the server" / « tout passe par le serveur »).
- Under the server: cylinder "Database: shows, episodes, who follows what, positions" / « Base : émissions, épisodes, qui suit quoi, positions ».
- Right, three boxes with arrows from the server: "iTunes directory — search, no key" / « Annuaire iTunes — recherche, sans clé »; "Podcast Index — optional key: search by person" / « Podcast Index — clé facultative : recherche par personne » (dashed border); "Show hosts — RSS feed every hour, audio and pictures relayed" / « Hébergeurs des émissions — flux RSS toutes les heures, audio et images relayés ».
- Text only, no brand logos.

## Console screenshots (kind: console, 16:9, webp)

### /assets/img/docs/library-scan/01-library-page.{en,fr}.webp
Console → Music → Library (« Musique → Bibliothèque »), not scanning. Visible: title, the line "N songs · last scan …", Quick scan and Full scan buttons top right, the last scan summary line, the tabs Songs / Missing files / Duplicates / No cover / Online with their counts, the first rows of the Songs list.

### /assets/img/docs/library-scan/02-automatic-scan.{en,fr}.webp
Same page scrolled to the bottom: the "Automatic scan" setting with its explanation, the select **open** showing "On changes only", "And every hour" (selected), "And every 6 hours", "And once a day". If possible a second state is not needed.

### /assets/img/docs/library-scan/03-track-page.{en,fr}.webp
Console → Library → click a song that has a file, an ISRC, genres, plays and likes. Visible: title and artists, the "Listen to check" button, the Files block (path, format, bit rate, size), ISRC, genres, plays, likes "N accounts".

### /assets/img/docs/library-online-catalogue/01-imports-page.{en,fr}.webp
Console → Music → Imports, with a few imports in different states (at least one Done, one Waiting or Running, one Failed with "next try …"). Visible: filters All / Waiting / Running / Failed / Done, the search field, rows with song, "Asked by" (test account), state, attempts, Retry / Remove buttons. The top of the "Import settings" block may show at the bottom. Provider names on screen must be only "Subsonic relay" and/or "Deezer previews" (the public ones).

### /assets/img/docs/library-online-catalogue/02-import-settings.{en,fr}.webp
Same page, scrolled to "Import settings" and "Providers": Automatic import switch, Quality (MP3 128 / MP3 320 / FLAC), the Filing line "Musonic/Album artist/Album/NN - Title", the provider list (public providers only: previews, optionally Subsonic relay, state "Working"), the switches Online catalog and 30-second previews.

### /assets/img/docs/library-online-catalogue/03-account-rights.{en,fr}.webp
Console → People → Accounts → a non-administrator test account. Visible: the Rights block (4 switches) and the Quotas block (Imports per day, Imports per month, Largest size of their imports in GB, Highest playback bit rate) with "By default: unlimited". Note: the first right's title in the console reads "Import from Deezer" / « Importer depuis Deezer » (see report): if the label is changed before shooting, shoot the new label.

### /assets/img/docs/library-podcasts/01-podcasts-block.{en,fr}.webp
Console → Imports, scrolled to the bottom "Podcasts" block, **without** a Podcast Index key: "Podcast Index · N shows followed · N episodes", the line "No key: only the iTunes directory is used (no search by person)." and the "Add the key" button. The YouTube Music block below may be visible.

### /assets/img/docs/library-podcasts/02-podcast-index-key.{en,fr}.webp
Same page, after clicking "Add the key": the "Podcast Index key" window with its help line, empty API Key field, API Secret field (password type), the note about the database, Cancel and "Check and save" buttons. Never type a real key.
