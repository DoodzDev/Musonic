# Images — migration/navidrome (agent navidrome)

## 1. /assets/img/docs/diagrams/navidrome-migration.en.svg and .fr.svg
- Kind: diagram (class `diagram`), used at the top of the page in both languages.
- Layout, left to right, three columns:
  - Left: box "Music folder" / "Dossier de musique" (folder icon).
  - Middle, stacked: box "Navidrome (port 4533)" on top; box "Musonic Server (port 4534)" below.
    Two arrows from "Music folder" to each server, labelled "read" / "lecture" (the arrow to Musonic also labelled ":ro").
  - Between the two servers: small box "navidrome-copy.db" with an arrow from Navidrome labelled "1. sqlite3 .backup" / "1. sqlite3 .backup", and an arrow into Musonic labelled "2. import-navidrome" / "2. import-navidrome". Small note next to the Navidrome database: "never written" / "jamais modifiée".
  - Right: box "Apps (Musonic, Subsonic apps)" / "Applis (Musonic, applis Subsonic)" behind a box "Reverse proxy (HTTPS)".
    Solid arrow reverse proxy -> Navidrome labelled "today" / "aujourd'hui"; dashed arrow reverse proxy -> Musonic labelled "3. after validation" / "3. après validation".
- No colours meaning anything beyond Musonic vs Navidrome; neutral, sober.

## 2. /assets/img/docs/migration-navidrome/01-import-report.en.webp
- Kind: terminal (English in both pages, the FR page uses the .en file).
- State: a terminal after running
  `docker compose run --rm musonic-server import-navidrome /data/navidrome-copy.db`
  on a real test library, showing the full JSON report with all fields:
  users, users_skipped (at least one name, to show the case), files_matched, files_not_found,
  ids_kept, playlists, playlists_already_there, playlist_entries, playlist_entries_missing,
  track_annotations, album_annotations, artist_annotations, plays.
  No secrets, no real people's names (use test accounts).

## 3. /assets/img/docs/migration-navidrome/02-console-reset-link.en.webp and .fr.webp
- Kind: web (admin console, 16:9, class `shot-wide`).
- State: admin console, Accounts -> open one (test) account -> click the button "Password reset link"
  (FR "Lien de réinitialisation"). The modal "Reset <name>'s password" (FR "Réinitialiser le mot de passe de <nom>")
  is open, before clicking "Create the link" (FR "Créer le lien"), button visible. Console in EN / FR respectively.
