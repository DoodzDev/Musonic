# Images — admin/console, admin/accounts, admin/backups, admin/configuration (agent admin)

General rules for every console shot:
- Kind: console (web, 16:9, class `shot-wide`), browser window about 1600×900, no browser bars, no bookmarks.
- Console set to the page language (EN: English; FR: French) with Settings and maintenance → Console language. One `.en.webp` and one `.fr.webp` per entry.
- Use a test server with test accounts only (e.g. admin `doodz`, users `lea`, `tom`, `sam`), a library of a few hundred songs, no real names of other people, no real IP addresses (mask them if shown), no tokens, keys or credentials visible. Hide or blur the server address in the sidebar if it is a private domain.
- Light or dark: the console's default; keep the same for all shots.

---

## admin/console (`/assets/img/docs/admin-console/`)

### 01-login.en.webp / .fr.webp
- Page `/login` signed out. Fields empty (or Name filled with `doodz`, password empty). Title "Musonic Console" / "Console Musonic", button "Sign in" / "Se connecter", the line "To listen, use Musonic Web or the app…" visible.

### 02-dashboard.en.webp / .fr.webp
- Page `/` (Dashboard / Tableau de bord), signed in as admin. Must show: left menu with all groups (People, Music, Server), live bar at the top with figures (Running for…, In/Out, listening, imports, CPU, RAM), the alerts card saying "All is well" (or one harmless alert such as "Musonic Server X is out"), the figure cards (songs, albums, music, accounts), Disk space, Right now with one test account playing a song, Recent activity, Versions.

### 03-accounts.en.webp / .fr.webp
- Page `/accounts`. List with 3–4 test accounts (one Administrator, one Suspended), columns Account, Role, Last sign-in, Devices, Imports (this month) with one "n / max". Below: Invitations with one Pending, one Used by…, one Expired. Password resets in progress: one line.

### 05-account.en.webp / .fr.webp
- Page `/accounts/<id>` of user `lea`. Header with buttons "Password reset link" and "Delete". Cards Role (User selected), Account (Active account on, Sign out everywhere), Rights (four switches, first three on), Quotas (Imports per day 10, the rest unlimited), Devices with 2 keys (e.g. "Pixel", "Musonic Web").

### 06-security.en.webp / .fr.webp
- Page `/security`. Devices table with several keys from 2–3 accounts; Recent sign-ins with a few lines (IP addresses masked or private like 192.168.x.x); Blocked addresses with one line ("account “tom” · 10 tries", Unblock button) — produce it by 10 wrong passwords on a test account; the Legacy Subsonic sign-in switch on.

### 07-library.en.webp / .fr.webp
- Page `/library`, tab Songs. Summary line with number of songs and last scan; buttons Quick scan / Full scan; Automatic scan select visible; tabs Songs, Missing files, Duplicates, No cover, Online; table of songs with covers.

### 08-imports.en.webp / .fr.webp
- Page `/imports`. Counters (waiting, running, failed, done) with non-zero values; table with a few imports in different states (one Given up with Retry button); Import settings card (Automatic import on, Quality MP3 320, Filing line, Online catalog on, 30-second previews on); Providers card listing the providers of the test server (at least the 30-second previews one, "Working"). Do not show any credential value. Podcasts and YouTube Music import cards may be below the fold.

### 09-playback.en.webp / .fr.webp
- Page `/playback`. Streaming card: ffmpeg "Present · <version>", Highest bit rate by default = No limit, Format of smaller songs = MP3. Caches card: Online songs, Pictures, Transcoded songs (500 MB selected) with sizes and Empty buttons; Volume levelling "Later".

### 10-data.en.webp / .fr.webp
- Page `/data`, period Day or Week, with a few days of measures. Sent this month with a limit set (e.g. 10 TB) and the projection line; traffic chart; processor and memory charts; disk card. Host traffic visible (mount `/proc/1/net/dev` as in compose.example.yml) so the "Only Musonic's traffic" note is not shown.

### 11-settings.en.webp / .fr.webp
- Page `/settings`. Musonic Web on this server (Installed: version, Open); Backups (Latest: date · size, Back up now, Days kept 14 days, list of 3+ backups with Download); Maintenance (Restart, Check for updates on); Activity log size; Server logs with a few INFO lines (no secrets, no IPs); Console language.

### 12-activity.en.webp / .fr.webp
- Page `/activity`. Filters (All selected, Today), search empty, list with varied events of the day: sign-ins, an account created with an invitation, imports, "Database backed up". IP addresses masked.

### 13-admin-log.en.webp / .fr.webp
- Page `/journal`. A few administrator actions: created an invitation, changed the rights and quotas of lea, changed a setting, downloaded a backup, restarted the server.

---

## admin/accounts (`/assets/img/docs/admin-accounts/`)

### 01-invite-button.en.webp / .fr.webp
- Page `/accounts`, the "Invite someone" / "Inviter quelqu'un" button highlighted (a subtle outline or arrow added in editing, sober).

### 02-invite-form.en.webp / .fr.webp
- The Invite someone modal open, before creating: Note = "My cousin Lea" (FR "Ma cousine Léa"), Role = User selected, Valid = "7 d" (FR "7 j") selected, the line "Until <date>. From a minute to a year." visible, buttons Cancel / Create the invitation.

### 03-invite-link.en.webp / .fr.webp
- Same modal after "Create the invitation": "Link to send (shown once)" with the link field and the Copy button. Blur the token part of the link (keep `https://…/invite/` readable).

### 04-invite-page.en.webp / .fr.webp
- Kind: phone (portrait 9:16, class `shot-phone`), Galaxy A52 browser (Chrome) set to EN / FR, opening an invitation link. Page "Welcome to Musonic" / "Bienvenue sur Musonic", "doodz invites you.", fields Name (filled `lea`), Password and Confirm the password (filled, dots), button "Create my account" / "Créer mon compte", and "Link valid until …, once." Address bar may be visible but the token blurred.

### 05-invite-ready.en.webp / .fr.webp
- Kind: phone, same browser, right after creating the account: "Your account is ready" / "Votre compte est prêt", the server address to add, and the sign-in sentence.

### 06-account-page.en.webp / .fr.webp
- Page `/accounts/<id>` of `lea`, focus on the upper part: Role (User), Active account switch, Sign out everywhere, Rights.

### 07-rights-quotas.en.webp / .fr.webp
- Same page, scrolled to Rights and Quotas: four rights switches; Imports per day 10, Imports per month 100, Largest size of their imports 5 GB, Highest playback bit rate 192 kbit/s; "Saved" shown; "This month: N imports." line.

### 08-reset-form.en.webp / .fr.webp
- On lea's page, "Password reset link" clicked: modal "Reset lea's password" / "Réinitialiser le mot de passe de lea", Valid = 24 h selected, switch "Sign their devices out" visible, button "Create the link".

### 09-reset-page.en.webp / .fr.webp
- Kind: phone, Galaxy A52 browser, a reset link opened: "New password" / "Nouveau mot de passe", "For the account lea", fields Password and Confirm the password, the note "Your devices may have to sign in again." if the switch was on. Token blurred.

### 10-delete.en.webp / .fr.webp
- On lea's page, "Delete" clicked: modal "Delete lea's account?" / "Supprimer le compte de lea ?" with the warning text, the box "Type lea to confirm" / "Tapez lea pour confirmer" filled with `lea`, button "Delete for good" / "Supprimer définitivement". Take the shot, then cancel (do not delete).

---

## admin/backups (`/assets/img/docs/admin-backups/`)

### 01-backups-card.en.webp / .fr.webp
- Page `/settings`, cropped or scrolled to the Backups card: "Latest: <date> · <size>", Back up now button, Days kept = 14 days, list of at least 3 daily backups `musonic-YYYY-MM-DD.db` with sizes and a Download button each, and the warning line about providers' credentials.

---

## Diagrams (`/assets/img/docs/diagrams/`, class `diagram`, sober, neutral colours, same style as the other diagrams)

### server-paths.en.svg / server-paths.fr.svg (admin/console)
- Left: one box "Your server's address — https://music.example.com" (FR "L'adresse de votre serveur — https://music.example.com").
- From it, four arrows to four boxes on the right, each with the path in monospace:
  - `/` → "Administration console (administrators only)" / "Console d'administration (administrateurs seulement)"
  - `/app/` → "Musonic Web (the web player, once installed)" / "Musonic Web (le lecteur web, une fois installé)"
  - `/rest/…` → "Subsonic API (Subsonic apps)" / "API Subsonic (applications Subsonic)"
  - `/v1/…` → "Musonic API (Musonic apps)" / "API Musonic (applications Musonic)"
- Small note under the left box: "Musonic Server · port 4533 behind HTTPS" / "Musonic Server · port 4533 derrière HTTPS".

### settings-priority.en.svg / settings-priority.fr.svg (admin/configuration)
- Four stacked horizontal layers, bottom to top, each overlapping the one below like sheets:
  1. "Default value" / "Valeur par défaut"
  2. "Configuration file (MUSONIC_CONFIG)" / "Fichier de configuration (MUSONIC_CONFIG)"
  3. "Environment variables (MUSONIC_…)" / "Variables d'environnement (MUSONIC_…)"
  4. "Saved in the console (database)" / "Enregistré dans la console (base de données)"
- An upward arrow on the side labelled "wins at start-up" / "l'emporte au démarrage".
- Small note next to layer 4: "only the 11 console settings" / "seulement les 11 réglages de la console".

### what-to-back-up.en.svg / what-to-back-up.fr.svg (admin/backups)
- Three boxes with a check mark "back up" / "à sauvegarder":
  - "Music folder (your files + Musonic/ imports)" / "Dossier de musique (vos fichiers + imports Musonic/)"
  - "Data folder" / "Dossier de données" containing two highlighted items `musonic.db` and `secret.key`, a lighter item `backups/` with the note "copy to another disk" / "à copier sur un autre disque", and a lighter optional item `events.db` ("optional" / "facultatif").
  - "`compose.yml` (or configuration file)" / "`compose.yml` (ou fichier de configuration)"
- One greyed box with a cross "no need" / "inutile": `cache/`, `tmp/`, `web/` ("made again" / "recréés").
