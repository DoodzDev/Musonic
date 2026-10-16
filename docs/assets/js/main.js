/**
 * @file main.js
 * @description Presentation website: English / French texts, the latest
 *   mobile version read from GitHub releases (tags `mobile-v…`), and the
 *   portrait / landscape screenshot switch.
 * @author DoodzProg
 * @version 2.0.0
 * @license CC-BY-NC-4.0
 */

const TEXTS = {
  en: {
    'nav.skip': 'Skip to content',
    'nav.ecosystem': 'Ecosystem',
    'nav.use': 'Use Musonic',
    'nav.screens': 'Screenshots',
    'nav.start': 'Get started',
    'hero.title': 'Your music server, everywhere you listen.',
    'hero.lead': 'Musonic plays the music you host on Navidrome or any Subsonic server. A calm app on your phone today, a web client and server tools next. No account, no ads, nothing but your library.',
    'hero.version': 'Latest version',
    'hero.versionOf': (v) => `Version ${v}`,
    'hero.req': 'Android 7 or later, free and open source',
    'cta.android': 'Download for Android',
    'cta.ios': 'iOS sideload',
    'cta.other': 'Other platforms',
    'eco.title': 'More than an app',
    'eco.lead': 'Musonic is growing into a whole music environment built around your own server. Every piece speaks the same language and looks the same, on every screen.',
    'eco.root.title': 'Your music server',
    'eco.root.desc': 'Navidrome or any Subsonic-compatible server, at home or on a VPS. Your files never leave it.',
    'eco.mobile.title': 'Mobile app',
    'eco.mobile.desc': 'Android and iOS. Library, synced lyrics, Magic Mixes, offline downloads.',
    'eco.web.title': 'Web client',
    'eco.web.desc': 'The same Musonic in your browser, made for desktop.',
    'eco.server.title': 'Server and API',
    'eco.server.desc': 'Server-side features: imports, recommendations, sharing between accounts.',
    'eco.tools.title': 'Local tools',
    'eco.tools.desc': 'Command line and desktop helpers for local files and your library.',
    'status.available': 'Available',
    'status.dev': 'In development',
    'status.planned': 'Planned',
    'status.idea': 'Exploring',
    'use.title': 'Use Musonic',
    'use.lead': 'Pick the way you listen. The mobile app is ready now; the rest arrives step by step.',
    'use.mobile.title': 'Mobile',
    'use.mobile.desc': 'Install the APK on Android, or sideload the IPA on iPhone with AltStore or Sideloadly. The app tells you when an update is out.',
    'use.notes': 'Release notes',
    'use.web.title': 'Web',
    'use.web.desc': 'Musonic in a browser tab, with your library, playback and the same home as on your phone. Not released yet.',
    'use.soon': 'Not available yet',
    'use.server.title': 'Server',
    'use.server.desc': 'For now Musonic works with Navidrome directly. A Musonic server layer will come later.',
    'use.navidrome': 'Install Navidrome',
    'scr.title': 'Screenshots',
    'scr.lead': 'The mobile app, as it looks today.',
    'scr.portrait': 'Portrait',
    'scr.landscape': 'Landscape',
    'cap.home': 'Home',
    'cap.player': 'Player',
    'cap.lyrics': 'Synced lyrics',
    'cap.mix': 'Magic Mix',
    'cap.foryou': 'For you',
    'cap.search': 'Search',
    'cap.artist': 'Artist',
    'cap.album': 'Album',
    'cap.library': 'Library',
    'cap.grid': 'Library, grid',
    'cap.liked': 'Liked Songs',
    'cap.queue': 'Queue',
    'cap.settings': 'Settings',
    'hl.title': 'What you get',
    'hl.play': 'Playback',
    'hl.lyrics.t': 'Synced lyrics',
    'hl.lyrics.d': 'Line by line in the player. Tap a line to jump to it.',
    'hl.queue.t': 'A queue you control',
    'hl.queue.d': 'Shuffle, repeat, autoplay, reorder, and restored where you left it.',
    'hl.magic.t': 'Shuffle Magic',
    'hl.magic.d': 'Your songs, with related tracks found online in between.',
    'hl.discover': 'Discovery',
    'hl.home.t': 'A home that knows you',
    'hl.home.d': 'Recently played, picks for you and artists to discover.',
    'hl.mixes.t': 'Magic Mixes',
    'hl.mixes.d': 'One mix per genre, with about 3 discoveries in 10.',
    'hl.search.t': 'One search',
    'hl.search.d': 'Your library and the online catalogue, with a top result.',
    'hl.offline': 'Offline and data',
    'hl.dl.t': 'Downloads',
    'hl.dl.d': 'Playlists, albums or single tracks, ready with no signal.',
    'hl.wifi.t': 'Wi-Fi first',
    'hl.wifi.d': 'Downloads wait for Wi-Fi; streaming quality is set per network.',
    'hl.private.t': 'Private by design',
    'hl.private.d': 'No account, no analytics. Only artist and track names leave your phone, for photos and lyrics.',
    'start.title': 'Get started',
    'start.1.t': 'Run a music server',
    'start.1.d': 'Install Navidrome, or use any Subsonic-compatible server you already have.',
    'start.2.t': 'Install Musonic',
    'start.2.d': 'Download the APK on Android, or sideload the IPA on iPhone.',
    'start.3.t': 'Sign in to your server',
    'start.3.d': 'Enter its address, your username and password. Your library is there.',
    'foot.releases': 'Releases',
    'foot.issue': 'Report an issue',
    'foot.made': 'Made by',
  },
  fr: {
    'nav.skip': 'Aller au contenu',
    'nav.ecosystem': 'Écosystème',
    'nav.use': 'Utiliser Musonic',
    'nav.screens': 'Captures',
    'nav.start': 'Commencer',
    'hero.title': 'Votre serveur de musique, partout où vous écoutez.',
    'hero.lead': "Musonic lit la musique que vous hébergez sur Navidrome ou tout serveur Subsonic. Une app sobre sur votre téléphone aujourd'hui, un client web et des outils serveur ensuite. Sans compte, sans pub, juste votre bibliothèque.",
    'hero.version': 'Dernière version',
    'hero.versionOf': (v) => `Version ${v}`,
    'hero.req': 'Android 7 ou plus récent, gratuit et open source',
    'cta.android': 'Télécharger pour Android',
    'cta.ios': 'iOS (sideload)',
    'cta.other': 'Autres plateformes',
    'eco.title': "Plus qu'une app",
    'eco.lead': "Musonic devient tout un environnement musical construit autour de votre propre serveur. Chaque brique parle le même langage et a le même visage, sur chaque écran.",
    'eco.root.title': 'Votre serveur de musique',
    'eco.root.desc': "Navidrome ou tout serveur compatible Subsonic, chez vous ou sur un VPS. Vos fichiers n'en sortent jamais.",
    'eco.mobile.title': 'App mobile',
    'eco.mobile.desc': 'Android et iOS. Bibliothèque, paroles synchronisées, Mix Magiques, téléchargements hors ligne.',
    'eco.web.title': 'Client web',
    'eco.web.desc': 'Le même Musonic dans votre navigateur, pensé pour l’ordinateur.',
    'eco.server.title': 'Serveur et API',
    'eco.server.desc': 'Des fonctions côté serveur : imports, recommandations, partage entre comptes.',
    'eco.tools.title': 'Outils locaux',
    'eco.tools.desc': 'Ligne de commande et utilitaires de bureau pour vos fichiers locaux et votre bibliothèque.',
    'status.available': 'Disponible',
    'status.dev': 'En développement',
    'status.planned': 'Prévu',
    'status.idea': 'À l’étude',
    'use.title': 'Utiliser Musonic',
    'use.lead': "Choisissez comment vous écoutez. L'app mobile est prête ; le reste arrive étape par étape.",
    'use.mobile.title': 'Mobile',
    'use.mobile.desc': "Installez l'APK sur Android, ou l'IPA sur iPhone avec AltStore ou Sideloadly. L'app vous prévient quand une mise à jour sort.",
    'use.notes': 'Notes de version',
    'use.web.title': 'Web',
    'use.web.desc': 'Musonic dans un onglet, avec votre bibliothèque, la lecture et le même accueil que sur le téléphone. Pas encore publié.',
    'use.soon': 'Pas encore disponible',
    'use.server.title': 'Serveur',
    'use.server.desc': "Pour l'instant, Musonic fonctionne directement avec Navidrome. Une couche serveur Musonic viendra plus tard.",
    'use.navidrome': 'Installer Navidrome',
    'scr.title': 'Captures',
    'scr.lead': "L'app mobile, telle qu'elle est aujourd'hui.",
    'scr.portrait': 'Portrait',
    'scr.landscape': 'Paysage',
    'cap.home': 'Accueil',
    'cap.player': 'Lecteur',
    'cap.lyrics': 'Paroles synchronisées',
    'cap.mix': 'Mix Magique',
    'cap.foryou': 'Pour vous',
    'cap.search': 'Recherche',
    'cap.artist': 'Artiste',
    'cap.album': 'Album',
    'cap.library': 'Bibliothèque',
    'cap.grid': 'Bibliothèque, grille',
    'cap.liked': 'Titres likés',
    'cap.queue': "File d'attente",
    'cap.settings': 'Réglages',
    'hl.title': 'Ce que vous obtenez',
    'hl.play': 'Lecture',
    'hl.lyrics.t': 'Paroles synchronisées',
    'hl.lyrics.d': 'Ligne par ligne dans le lecteur. Touchez une ligne pour y aller.',
    'hl.queue.t': "Une file d'attente à vous",
    'hl.queue.d': 'Aléatoire, répétition, lecture auto, réorganisation, reprise là où vous en étiez.',
    'hl.magic.t': 'Aléatoire Magique',
    'hl.magic.d': 'Vos titres, avec des morceaux proches trouvés en ligne entre eux.',
    'hl.discover': 'Découverte',
    'hl.home.t': 'Un accueil qui vous connaît',
    'hl.home.d': 'Écoutés récemment, sélections pour vous et artistes à découvrir.',
    'hl.mixes.t': 'Mix Magiques',
    'hl.mixes.d': 'Un mix par genre, avec environ 3 découvertes sur 10.',
    'hl.search.t': 'Une seule recherche',
    'hl.search.d': 'Votre bibliothèque et le catalogue en ligne, avec un meilleur résultat.',
    'hl.offline': 'Hors ligne et données',
    'hl.dl.t': 'Téléchargements',
    'hl.dl.d': 'Playlists, albums ou titres seuls, prêts sans réseau.',
    'hl.wifi.t': "Le Wi-Fi d'abord",
    'hl.wifi.d': 'Les téléchargements attendent le Wi-Fi ; la qualité se règle par réseau.',
    'hl.private.t': 'Privé par conception',
    'hl.private.d': "Sans compte ni statistiques. Seuls les noms d'artistes et de titres quittent votre téléphone, pour les photos et les paroles.",
    'start.title': 'Commencer',
    'start.1.t': 'Avoir un serveur de musique',
    'start.1.d': 'Installez Navidrome, ou utilisez un serveur compatible Subsonic que vous avez déjà.',
    'start.2.t': 'Installer Musonic',
    'start.2.d': "Téléchargez l'APK sur Android, ou installez l'IPA sur iPhone.",
    'start.3.t': 'Se connecter au serveur',
    'start.3.d': 'Entrez son adresse, votre identifiant et votre mot de passe. Votre bibliothèque est là.',
    'foot.releases': 'Versions',
    'foot.issue': 'Signaler un problème',
    'foot.made': 'Fait par',
  },
};

let lang = 'en';
let mobileVersion = null;

function readStored(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function store(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private mode */ }
}

function applyLanguage(next) {
  const t = TEXTS[next];
  if (!t) return;
  lang = next;
  document.documentElement.lang = next;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const value = t[el.dataset.i18n];
    if (typeof value === 'string') el.textContent = value;
  });
  document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === next)));
  showVersion();
}

function showVersion() {
  if (!mobileVersion) return;
  document.querySelectorAll('.js-version').forEach((el) => { el.textContent = TEXTS[lang]['hero.versionOf'](mobileVersion); });
}

/** Latest published mobile release: tags `mobile-vX.Y.Z` (one repository, several apps). */
async function loadVersion() {
  try {
    const res = await fetch('https://api.github.com/repos/DoodzProg/Musonic/releases?per_page=30');
    if (!res.ok) return;
    const releases = await res.json();
    const mobile = releases.find((r) => !r.draft && !r.prerelease && /^mobile-v\d/.test(r.tag_name));
    if (mobile) {
      mobileVersion = mobile.tag_name.replace('mobile-v', '');
      showVersion();
    }
  } catch { /* offline or rate-limited: keep "Latest version" */ }
}

function initLanguage() {
  const saved = readStored('musonic-lang');
  const guess = (navigator.language || '').toLowerCase().startsWith('fr') ? 'fr' : 'en';
  applyLanguage(saved === 'fr' || saved === 'en' ? saved : guess);
  document.querySelectorAll('[data-lang]').forEach((b) => {
    b.addEventListener('click', () => { applyLanguage(b.dataset.lang); store('musonic-lang', b.dataset.lang); });
  });
}

function initShots() {
  const buttons = document.querySelectorAll('[data-shots]');
  buttons.forEach((b) => {
    b.addEventListener('click', () => {
      buttons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      document.querySelectorAll('.shots').forEach((set) => { set.hidden = set.dataset.set !== b.dataset.shots; });
    });
  });
}

initLanguage();
initShots();
loadVersion();
