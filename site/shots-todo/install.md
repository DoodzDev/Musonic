# Images to produce — agent `install`

Pages: `start/how-it-works`, `install/docker`, `install/binary`, `install/first-start`, `install/https`, `install/update` (EN + FR).
Every picture exists in `.en` and `.fr`, the console / app set to that language. Use a test server whose public address appears as `https://music.example.com` (never a real domain or IP). Admin account name in every shot: `alice`. Console shots: 16:9, browser at 1600×900, light or dark consistently with the other console shots of the site.

## Diagrams (`/assets/img/docs/diagrams/`, class `diagram`)

### how-it-works.en.svg / how-it-works.fr.svg
Left to right.
- Box 1 (left): folder icon. EN "Your music folder" / FR "Votre dossier de musique"; small text EN "on a disk at home" / FR "sur un disque à la maison".
- Arrow 1 → box 2, label EN "read and watched" / FR "lu et surveillé".
- Box 2 (centre, larger): logo + EN "Musonic Server" (same in FR); small text EN "always-on machine: home server, NAS, Raspberry Pi, VPS" / FR "machine toujours allumée : serveur maison, NAS, Raspberry Pi, VPS". Inside box 2, a small sub-box EN "Console (administrators)" / FR "Console (administrateurs)".
- Three arrows from box 2 to the right, one label above them: EN "music, likes, playlists, in sync" / FR "musique, likes, playlists, synchronisés".
  - → Box 3a: phone icon, EN "Android app" / FR "Appli Android".
  - → Box 3b: browser window icon, EN "Web player (computer, iPhone, iPad)" / FR "Lecteur web (ordinateur, iPhone, iPad)".
  - → Box 3c: car dashboard icon, EN "Car (Android Auto, through the phone)" / FR "Voiture (Android Auto, via le téléphone)". Draw this arrow dashed, starting from box 3a (phone → car), not from the server.
- Optional thin dashed arrow from box 2 upward to a cloud: EN "online catalogue, updates (can be turned off)" / FR "catalogue en ligne, mises à jour (désactivables)".

### docker-folders.en.svg / docker-folders.fr.svg
Two big frames side by side.
- Left frame EN "Your machine" / FR "Votre machine", with three items:
  - `~/musonic-server/data`
  - `/path/to/music` (EN caption "your music folder" / FR "votre dossier de musique")
  - `127.0.0.1:4533` (EN caption "only this machine" / FR "seulement cette machine")
- Right frame EN "Container musonic-server" / FR "Conteneur musonic-server", with:
  - `/data` (EN "database, caches, backups" / FR "base, caches, sauvegardes")
  - `/music` (EN "read, or read-only with :ro" / FR "lu, ou en lecture seule avec :ro")
  - `port 4533`
- Double arrows: `~/musonic-server/data` ↔ `/data`; `/path/to/music` ↔ `/music`; `127.0.0.1:4533` ↔ `port 4533`.
- Under the arrows, the matching compose lines in monospace: `./data:/data`, `/path/to/music:/music`, `"127.0.0.1:4533:4533"`.

### https-proxy.en.svg / https-proxy.fr.svg
Left to right.
- Left: phone and laptop icons, label EN "Your devices, anywhere" / FR "Vos appareils, n'importe où".
- Arrow with padlock, label `https://music.example.com`.
- Middle: cloud EN "Internet" / FR "Internet".
- Arrow with padlock to a frame EN "Server machine" / FR "Machine du serveur" that contains two boxes:
  - Box A: EN "Reverse proxy (Caddy, nginx) or tunnel (Cloudflare, Tailscale)" / FR "Reverse proxy (Caddy, nginx) ou tunnel (Cloudflare, Tailscale)"; small text EN "HTTPS certificate" / FR "certificat HTTPS".
  - Arrow A → B, label EN "plain HTTP, inside the machine" / FR "HTTP simple, dans la machine".
  - Box B: `Musonic Server`, `127.0.0.1:4533`.
- A crossed-out arrow from the Internet cloud directly to box B, label EN "port 4533 never opened" / FR "port 4533 jamais ouvert".

## Console (16:9, class `shot-wide`) — `/assets/img/docs/install-first-start/`

State for all: fresh server, library already scanned (a few hundred songs), account `alice` (administrator) only, unless said otherwise. Browser address bar visible and showing `https://music.example.com/…`.

1. `01-console-sign-in.{en,fr}.webp` — Page `/login`, signed out. Title "Musonic Console" / "Console Musonic", subtitle "For this server's administrators." / "Réservée aux administrateurs de ce serveur.", field Name filled with `alice`, Password field filled (dots), button "Sign in" / "Se connecter" visible.
2. `02-dashboard.{en,fr}.webp` — Page `/` just after sign-in. Full left menu visible (Dashboard, Accounts, Devices and security, Library, Imports, Playback, Data, Settings and maintenance, Activity, Administration log), the live bar at the top, the cards with songs / albums / accounts. No alert in the bar.
3. `03-library.{en,fr}.webp` — Page `/library`. Header with "N songs · last scan …", buttons "Quick scan" / "Scan rapide" and "Full scan" / "Scan complet", tab "Songs" selected, a list of songs (title, album, format, source "File").
4. `04-webapp-install.{en,fr}.webp` — Page `/settings`, scrolled so that the section "Musonic Web on this server" / "Musonic Web sur ce serveur" is in view, showing "Not installed" / "Pas installé", "Latest version on GitHub: 1.2.0" / "Dernière version sur GitHub : 1.2.0" and the "Install" / "Installer" button. (Web player NOT installed yet on this test server.)
5. `05-accounts.{en,fr}.webp` — Page `/accounts`. One account `alice` (Administrator), button "Invite someone" / "Inviter quelqu'un" at the top right, section "Invitations" with "No invitation yet." / "Aucune invitation pour l'instant.".
6. `06-invite-form.{en,fr}.webp` — The "Invite someone" window open over `/accounts`, before creation: Note = "Invitation for my cousin Lea" / "Invitation pour ma cousine Léa", Role = User / Utilisateur selected, Valid = "7 d" / "7 j" selected, button "Create the invitation" / "Créer l'invitation".
7. `07-invite-link.{en,fr}.webp` — Same window after clicking create: "Link to send (shown once)" / "Lien à envoyer (montré une seule fois)", the link `https://music.example.com/invite/…` (blur or shorten the token), "Copy" / "Copier" button, "Done" / "Terminé" button.
8. `08-invite-page.{en,fr}.webp` — Open that link in a private window (signed out): "Welcome to Musonic" / "Bienvenue sur Musonic", "alice invites you. Choose your name and your password." / "alice vous invite. Choisissez votre nom et votre mot de passe.", fields Name (filled `lea`), Password and Confirm the password (dots), button "Create my account" / "Créer mon compte", line "Link valid until …, once." under it.
9. `09-invite-done.{en,fr}.webp` — After submitting: "Your account is ready" / "Votre compte est prêt", the box `https://music.example.com`, the text "and sign in with the name and password you just chose." / "et connectez-vous avec le nom et le mot de passe que vous venez de choisir.".

## Update page — `/assets/img/docs/install-update/`

1. `01-update-alert.{en,fr}.webp` — console, 16:9, class `shot-wide`. Page `/` (Dashboard) on a server running an older version than the newest `server-v…` release, so that the top bar shows the alert "Musonic Server X is out" / "Musonic Server X est disponible" and the "Versions" card shows "Installed: … · latest: …" and "Update available" / "Mise à jour disponible".
2. `02-android-update.{en,fr}.webp` — phone, 9:16, class `shot-phone`. Galaxy A52, app set to the language. Install a mobile build older than the latest `mobile-v…` release, open it, wait 3 s: the system dialog "Update available" / "Mise à jour disponible", text "Version X is available on GitHub." / "La version X est disponible sur GitHub.", buttons "Cancel" / "Annuler" and "View release" / "Voir la release".

No picture is used on `install/docker` and `install/binary` besides the diagram above (commands are code blocks), nor on `install/https` besides its diagram.
