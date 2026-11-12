# Images for reference/audio-quality and reference/privacy (agent audio-privacy)

## 1. `/assets/img/docs/reference-audio-quality/01-crossfade-setting.en.webp` and `.fr.webp`
- Kind: phone (Galaxy A52, Android 14), portrait 9:16, class `shot-phone`.
- State: Android app 2.4.0, app language EN (then FR). Open Settings (main screen, not "Advanced options"). Scroll so the **Playback** / **Lecture** section is visible, with the **Crossfade** / **Fondu entre les titres** slider set to **6 s** (value "6 s" visible at the right of the slider) and its description text fully visible. The **Quality and downloads** / **Qualité et téléchargements** section header may be visible below.
- Set it back to 0 s afterwards.

## 2. `/assets/img/docs/diagrams/audio-path.en.svg` and `.fr.svg`
- Kind: diagram, class `diagram`. Left to right, five boxes linked by arrows:
  1. **Your music file** / **Votre fichier** — small caption "MP3, FLAC, M4A…".
  2. **Musonic Server** — inside it, a fork into two lanes: top lane "Original file (default)" / "Fichier original (par défaut)"; bottom lane "Lighter copy by ffmpeg (bit rate limit)" / "Copie allégée par ffmpeg (limite de débit)" with a small tag "MP3 / Opus / AAC".
  3. **Player** / **Lecteur** — two stacked labels: "Android app: Media3" / "Appli Android : Media3" and "Web player: the browser" / "Lecteur web : le navigateur". Caption: "decodes" / "décode".
  4. **System mixer** / **Mélangeur du système** — caption "Android or your computer: volume, other sounds, resampling" / "Android ou votre ordinateur : volume, autres sons, rééchantillonnage".
  5. **Output** / **Sortie** — four small icons with labels: "Speaker" / "Haut-parleur", "Bluetooth (codec chosen by the phone)" / "Bluetooth (codec choisi par le téléphone)", "USB DAC" / "DAC USB", "Car" / "Voiture".
- A thin bracket under boxes 1–3 labelled "Musonic" and under boxes 4–5 labelled "Your phone or computer" / "Votre téléphone ou ordinateur".

## 3. `/assets/img/docs/diagrams/privacy-network.en.svg` and `.fr.svg`
- Kind: diagram, class `diagram`.
- Center box: **Your Musonic Server** / **Votre Musonic Server**, with a small inner icon "Your music files — never leave" / "Vos fichiers — ne sortent jamais".
- Left: two boxes **Android app** / **Appli Android** and **Web player** / **Lecteur web**, each linked to the center by a thick two-way arrow labelled "your account, your music" / "votre compte, votre musique".
- Right of the server, outgoing thin arrows to boxes (each with a short label on the arrow):
  - **Deezer public API** / **API publique de Deezer** — "catalogue, covers, previews · switch: Online catalog" / "catalogue, pochettes, extraits · interrupteur : Catalogue en ligne"
  - **GitHub** — "new versions, every 6 h · switch: Check for updates" / "nouvelles versions, toutes les 6 h · interrupteur : Vérifier les mises à jour"
  - **Apple podcast directory + podcast hosts** / **Annuaire de podcasts Apple + hébergeurs** — "only if podcasts are used" / "seulement si les podcasts sont utilisés"
  - **Podcast Index** — "only with a key" / "seulement avec une clé" (dashed arrow)
  - **YouTube Data API** — "only with a key" / "seulement avec une clé" (dashed arrow)
- From the **Android app** box, thin arrows going left/down to: **LRCLIB** ("artist + title, missing lyrics" / "artiste + titre, paroles manquantes"), **Deezer public API** ("artist names: photos, suggestions" / "noms d’artistes : photos, suggestions"), **GitHub** ("only when you tap Check for updates" / "seulement si vous touchez Vérifier les mises à jour", dashed).
- From the **Web player** box, one thin arrow to **LRCLIB** (same label).
- Footer line in the diagram: "No analytics, no tracking, no crash reports" / "Aucune mesure d’audience, aucun pistage, aucun rapport de plantage".
