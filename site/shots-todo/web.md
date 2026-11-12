# Images to make: agent `web` (pages apps/web, apps/iphone, apps/other-clients)

Every picture exists in `en` and `fr` (web player set to that language with its Settings → Language, or the login screen's English · Français links). Web shots: 16:9, a real browser at 2× scale, a real account with real music.

## apps/web

### /assets/img/docs/apps-web/01-sign-in-empty.{en,fr}.webp
- kind: web
- Browser: Chrome on a computer, at `https://musonic.doodz.dev/app/`, signed out (clear site data first so the server field is empty).
- Show: Musonic logo, "Connect your music server" / « Connectez votre serveur de musique », empty fields Server address / Username / Password (placeholders visible: `https://music.example.com`, "Your username", "Your password"), "Remember me" unticked, "Sign in" button, the footnote, "English · Français" at the bottom.
- class `shot-wide`.

### /assets/img/docs/apps-web/02-home.{en,fr}.webp
- kind: web
- Signed in to a Musonic Server, on Home. Side menu visible on the left (Home active, Search, Library, Liked Songs, a few playlists with covers), Quick access tiles and at least two shelves ("Recently played", "Magic Mixes") in the middle, a song playing in the player bar at the bottom (cover, title, controls, progress). Queue panel closed. Window at least 1280 px wide.
- class `shot-wide`.

### /assets/img/docs/apps-web/03-install-chrome.{en,fr}.webp
- kind: web
- Chrome (not yet installed), at `https://musonic.doodz.dev/app/`, signed in on Home. Click the install icon at the right end of the address bar: the "Install app?" / « Installer l'application ? » bubble is open, showing the Musonic icon, the name Musonic, `musonic.doodz.dev`, and the Install / Installer button. Highlight (orange outline) the install icon in the address bar. The browser's UI must be in the page's language.
- class `shot-wide`.

## apps/iphone (illustrated vignettes, not real screenshots)

All in `/assets/img/docs/diagrams/`, class `diagram`. Drawn vignettes of an iPhone screen (portrait, simple flat outline of the phone, dark Musonic sign-in page inside where relevant). Highlight = orange (#ff6b35) circle or rounded outline around the element to tap. No real Apple logos; draw the share icon as the generic "square with an arrow pointing up". Text in the given language.

### iphone-safari-01-share.{en,fr}.svg
- kind: diagram
- Safari on iPhone. The page shows the Musonic sign-in screen (logo, "Connect your music server" / « Connectez votre serveur de musique », three fields, Sign in button), simplified.
- Bottom toolbar: back arrow, address field `musonic.doodz.dev`, and the Share icon (square with an arrow pointing up) circled in orange.
- Small caption under the phone: EN "iOS 26: tap ⋯ first, then Share" / FR « iOS 26 : touchez d'abord ⋯, puis Partager ».

### iphone-safari-02-add-to-home.{en,fr}.svg
- kind: diagram
- The iOS share sheet slid up over the page (lower two thirds): a row of round app icons (grey placeholders), then a list of lines: "Copy" / « Copier », "Add to Reading List" / « Ajouter à la liste de lecture », "Add Bookmark" / « Ajouter un signet », **"Add to Home Screen" / « Sur l'écran d'accueil »** with its icon (plus in a square), the last one highlighted with an orange outline.

### iphone-safari-03-add.{en,fr}.svg
- kind: diagram
- The "Add to Home Screen" / « Sur l'écran d'accueil » screen: top bar with "Cancel" / « Annuler » on the left and **"Add" / « Ajouter »** on the right (circled in orange); below, the black Musonic icon (real Musonic logo), a text field "Musonic", the grey address `musonic.doodz.dev`, and a switch "Open as Web App" / « Ouvrir en tant qu'app web » turned on (green).

### iphone-04-home-screen.{en,fr}.svg
- kind: diagram
- An iPhone Home Screen: a grid of 4 × 3 rounded grey placeholder icons, one of them the black Musonic icon (real logo) with the label "Musonic" under it, circled in orange. Same picture for both languages except an optional caption: EN "Musonic opens in its own window" / FR « Musonic s'ouvre dans sa propre fenêtre ».

### iphone-chrome-01-share.{en,fr}.svg
- kind: diagram
- Chrome on iPhone: address bar at the top showing `musonic.doodz.dev`, with the Share icon (square with an arrow pointing up) at its right end circled in orange; the page below shows the simplified Musonic sign-in screen; bottom bar with "⋯" at the right.

## apps/other-clients
No image.
