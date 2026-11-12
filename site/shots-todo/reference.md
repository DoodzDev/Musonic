# Images for reference/api, reference/cli, reference/architecture (agent `reference`)

No screenshots: these pages only use diagrams. Five diagrams, each in EN and FR (same layout, translated labels). Class `diagram`. Monochrome, sober style (no glow, no gradient), the real Musonic logo only if a logo is needed.

---

## 1. `/assets/img/docs/diagrams/api-surfaces.en.svg` / `api-surfaces.fr.svg`
- Kind: diagram. Used in `reference/api` (top).
- Layout, left to right, three columns.
- Left column, 4 boxes stacked (clients):
  - EN "Musonic apps (Android, Web)" / FR "Applis Musonic (Android, Web)"
  - EN "Other Subsonic clients" / FR "Autres clients Subsonic"
  - EN "Administration console" / FR "Console d'administration"
  - EN "Scripts" / FR "Scripts"
- Middle: one large box "Musonic Server" containing 4 labelled entry points (small boxes on its left edge):
  - `/rest/…` — EN "Subsonic / OpenSubsonic (XML, JSON)" / FR "Subsonic / OpenSubsonic (XML, JSON)"
  - `/v1/…` — EN "Native API (JSON)" / FR "API native (JSON)"
  - `/v1/events` — EN "Real-time events (WebSocket)" / FR "Événements en temps réel (WebSocket)"
  - `/health` — EN "Liveness" / FR "Test de vie"
- Arrows: "Musonic apps" → `/rest`, `/v1`, `/v1/events`; "Other Subsonic clients" → `/rest` only; "Administration console" → `/v1`; "Scripts" → `/rest` and `/v1` (dashed).
- Right column, 3 boxes, each with an arrow from the server:
  - EN "SQLite (musonic.db)" / FR "SQLite (musonic.db)"
  - EN "Music folder" / FR "Dossier de musique"
  - EN "Audio providers" / FR "Fournisseurs audio"

## 2. `/assets/img/docs/diagrams/architecture-overview.en.svg` / `architecture-overview.fr.svg`
- Kind: diagram. Used in `reference/architecture` (top).
- Top row, 4 client boxes: EN "Android app" / FR "Appli Android" (sub-label "React Native + Media3"); "Musonic Web" (sub-label "React + Vite"); EN "Console" / FR "Console" (sub-label "React + Vite"); EN "Other Subsonic clients" / FR "Autres clients Subsonic".
- Under them, a thin bar: EN "HTTPS (reverse proxy)" / FR "HTTPS (proxy inverse)". All 4 clients have an arrow down to it.
- Centre: box "Musonic Server" (sub-label "Rust"), arrow from the bar.
- Bottom row, 5 boxes with arrows from the server:
  - EN "Music folder" / FR "Dossier de musique" (arrow both ways, label EN "scan, imports" / FR "scan, imports")
  - EN "SQLite database" / FR "Base SQLite"
  - "ffmpeg" (label EN "transcoding" / FR "transcodage")
  - EN "Online catalogue (Deezer public API)" / FR "Catalogue en ligne (API publique Deezer)" (label EN "metadata, 30 s previews" / FR "métadonnées, extraits de 30 s")
  - EN "Audio providers (plugged by the admin)" / FR "Fournisseurs audio (branchés par l'admin)"
- A side box at left, dashed, linked by dashed lines to the Android app, Musonic Web and Console: "packages/core" (sub-label EN "shared TypeScript" / FR "TypeScript partagé").

## 3. `/assets/img/docs/diagrams/request-flow.en.svg` / `request-flow.fr.svg`
- Kind: diagram. Used in `reference/architecture`, section "The path of a request".
- Vertical flow, top to bottom:
  1. EN "Client" / FR "Client"
  2. EN "Reverse proxy (HTTPS)" / FR "Proxy inverse (HTTPS)"
  3. Three stacked thin layers in one box: EN "Security headers" / FR "En-têtes de sécurité"; "CORS"; EN "gzip compression (text > 1 KB)" / FR "Compression gzip (texte > 1 Ko)"
  4. EN "Router" / FR "Routeur"
- From the router, 6 branches side by side:
  - `/health`
  - `/rest/<endpoint>` → then a small chain: EN "Sign-in (apiKey, u+p, u+t+s)" / FR "Connexion (apiKey, u+p, u+t+s)" → EN "Answer cache?" / FR "Cache de réponses ?" with two exits: EN "hit: 304 or cached answer" / FR "trouvé : 304 ou réponse gardée", EN "miss: handler → SQLite" / FR "absent : traitement → SQLite". A side branch from the sign-in step: `stream / download / getCoverArt` → EN "file, ffmpeg or provider" / FR "fichier, ffmpeg ou fournisseur".
  - `/v1/…` → EN "Bearer token" / FR "Jeton Bearer" → EN "handler" / FR "traitement"
  - `/v1/events` → "WebSocket"
  - `/app/…` → EN "Musonic Web files" / FR "Fichiers de Musonic Web"
  - EN "any other path" / FR "tout autre chemin" → EN "Console files" / FR "Fichiers de la console"

## 4. `/assets/img/docs/diagrams/realtime-events.en.svg` / `realtime-events.fr.svg`
- Kind: diagram. Used in `reference/architecture`, section "Real-time sync".
- Left: box EN "Phone (device: phone)" / FR "Téléphone (device: phone)". Arrow to the server labelled `star?id=…` (EN "like a song" / FR "aimer un titre").
- Centre: "Musonic Server" with a small "SQLite" box under it (arrow EN "write" / FR "écriture") and a small box EN "event bus (512)" / FR "bus d'événements (512)".
- From the bus, 3 arrows out, each labelled `{"type":"likes", "by":"phone"}`:
  - to EN "Web player" / FR "Lecteur web"
  - to EN "Tablet" / FR "Tablette"
  - back to the Phone, dashed, labelled EN "own echo: ignored" / FR "son propre écho : ignoré"
- Caption box at bottom: EN "Same account only. Not stored: a reconnecting device reloads." / FR "Même compte uniquement. Rien n'est conservé : un appareil qui se reconnecte recharge."

## 5. `/assets/img/docs/diagrams/release-pipeline.en.svg` / `release-pipeline.fr.svg`
- Kind: diagram. Used in `reference/architecture`, section "Build and release".
- Three horizontal lanes, each: tag box → workflow box → output boxes.
  - Lane 1: `mobile-v*` → `android-release.yml` → EN "Signed APK" / FR "APK signé" → EN "GitHub release" / FR "Version GitHub"
  - Lane 2: `web-v*` → `web-release.yml` → `Musonic-Web.zip` (EN "self-hosting" / FR "hébergement autonome") and `Musonic-Web-app.zip` (EN "for /app/ of a server" / FR "pour /app/ d'un serveur")
  - Lane 3: `server-v*` → `server-release.yml` → EN "Docker image (amd64 + arm64) on ghcr.io" / FR "Image Docker (amd64 + arm64) sur ghcr.io", `musonic-server-…-linux-x86_64.tar.gz` / `…-aarch64.tar.gz`, `compose.yml`, EN "release notes from CHANGELOG" / FR "notes de version tirées du CHANGELOG"
- Do NOT draw any iOS lane.
