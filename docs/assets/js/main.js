/**
 * @file main.js
 * @description Musonic product showcase — progressive enhancement scripts.
 *   Handles i18n (EN/FR), scroll-reveal, sticky nav, screenshot tabs, and
 *   ambient hero parallax. No external runtime dependencies.
 * @author DoodzProg
 * @version 1.0.1
 * @license CC-BY-NC-4.0
 */

'use strict';

/* ─── i18n ───────────────────────────────────────────────────────────────────── */

const TRANSLATIONS = {
  en: {
    'nav.features':    'Features',
    'nav.screenshots': 'Screenshots',
    'nav.setup':       'Setup',
    'nav.stack':       'Stack',

    'hero.badge':          'v1.0.5 · Now available',
    'hero.headline':       'Self-hosted music,',
    'hero.headline.accent':'beautifully played.',
    'hero.subline':        'Open-source music player for Navidrome and Subsonic. Synced lyrics, ambient art, and no compromises.',
    'hero.dl.android':     'Download for Android',
    'hero.dl.ios':         'iOS Sideload',

    'features.label':    'Features',
    'features.title':    'Everything your music deserves.',
    'features.subtitle': 'For people who host their own music and want a player that actually feels good.',
    'features.f1.title': 'Navidrome &amp; Subsonic',
    'features.f1.desc':  'Works with any Navidrome or Subsonic server. Your library, your hardware.',
    'features.f2.title': 'Synced Lyrics',
    'features.f2.desc':  'Lyrics scroll line by line as the song plays. Uses your server\'s data, falls back to LRCLIB if needed.',
    'features.f3.title': 'Ambient UI',
    'features.f3.desc':  'Backgrounds shift with each album\'s colors. Every song has its own feel.',
    'features.f4.title': 'Offline Mode',
    'features.f4.desc':  'No signal? Downloaded tracks and cached data keep everything accessible. Toggle offline mode manually too.',
    'features.f5.title': 'MMKV Storage',
    'features.f5.desc':  'State is backed by MMKV, much faster than AsyncStorage. The app picks up exactly where you left it.',
    'features.f6.title': 'Multilingual',
    'features.f6.desc':  'Ships in English and French. The translation system is open and easy to extend.',

    'scr.label':    'Screenshots',
    'scr.title':    'See it in action.',
    'scr.subtitle': 'Captured on Samsung Galaxy S21 Ultra.',
    'scr.tab.player':    'Player',
    'scr.tab.browse':    'Browse',
    'scr.tab.library':   'Library',
    'scr.tab.playlists': 'Playlists',
    'scr.tab.more':      'More',
    'scr.cap.player_waves':    'Player · Waves',
    'scr.cap.player_classic':  'Player · Classic',
    'scr.cap.lyrics':          'Synced Lyrics',
    'scr.cap.queue':           'Queue',
    'scr.cap.home':            'Home',
    'scr.cap.search':          'Search',
    'scr.cap.album_detail':    'Album Detail',
    'scr.cap.artist_detail':   'Artist Detail',
    'scr.cap.library':         'Library',
    'scr.cap.sidebar':         'Sidebar',
    'scr.cap.playlist_options':'Playlist Options',
    'scr.cap.playlist_edit':   'Playlist Edit',
    'scr.cap.settings':        'Settings',

    'setup.label':       'Setup',
    'setup.title':       'Running in three steps.',
    'setup.subtitle':    'No account required. No cloud sync. Just your server and your music.',
    'setup.step1.title': 'Install Navidrome',
    'setup.step1.desc':  'Set up Navidrome or any Subsonic-compatible server.',
    'setup.step2.title': 'Download Musonic',
    'setup.step2.desc':  'Download the APK from GitHub Releases and install it.',
    'setup.step3.title': 'Connect &amp; Play',
    'setup.step3.desc':  'Add your server URL and login. Your library loads immediately.',

    'stack.label': 'Built with',
    'stack.title': 'Open, modern, and fast.',

    'cta.title':             'Ready to take back your music?',
    'cta.sub':               'Open source. Self-hosted. Yours.',
    'cta.download.android':  'Download for Android',
    'cta.download.ios':      'iOS Sideload',
    'cta.github':            'View on GitHub',
  },

  fr: {
    'nav.features':    'Fonctionnalités',
    'nav.screenshots': 'Captures',
    'nav.setup':       'Installation',
    'nav.stack':       'Stack',

    'hero.badge':          'v1.0.5 · Disponible maintenant',
    'hero.headline':       'Votre musique,',
    'hero.headline.accent':'magnifiquement jouée.',
    'hero.subline':        'Lecteur de musique open-source pour Navidrome et Subsonic. Paroles synchronisées, visuels ambiants, sans compromis.',
    'hero.dl.android':     'Télécharger pour Android',
    'hero.dl.ios':         'Sideload iOS',

    'features.label':    'Fonctionnalités',
    'features.title':    'Tout ce que votre musique mérite.',
    'features.subtitle': 'Pour ceux qui hébergent leur musique et veulent un lecteur qui en vaut la peine.',
    'features.f1.title': 'Navidrome &amp; Subsonic',
    'features.f1.desc':  'Fonctionne avec n\'importe quel serveur Navidrome ou Subsonic. Votre musique, votre matériel.',
    'features.f2.title': 'Paroles synchronisées',
    'features.f2.desc':  'Paroles qui défilent avec la musique, ligne par ligne. Depuis votre serveur ou LRCLIB en secours.',
    'features.f3.title': 'Interface ambiante',
    'features.f3.desc':  "L'arrière-plan change avec chaque album. Chaque morceau a sa propre ambiance.",
    'features.f4.title': 'Mode hors-ligne',
    'features.f4.desc':  "Pas de connexion ? Les titres téléchargés et le cache prennent le relais. Le mode hors-ligne s'active aussi manuellement.",
    'features.f5.title': 'Stockage MMKV',
    'features.f5.desc':  "État sauvegardé par MMKV, bien plus rapide qu'AsyncStorage. L'app reprend exactement où vous l'avez laissée.",
    'features.f6.title': 'Multilingue',
    'features.f6.desc':  'Disponible en anglais et en français. Le système de traduction est ouvert et facile à étendre.',

    'scr.label':    "Captures d'écran",
    'scr.title':    "Découvrez l'application.",
    'scr.subtitle': 'Capturé sur Samsung Galaxy S21 Ultra.',
    'scr.tab.player':    'Lecteur',
    'scr.tab.browse':    'Explorer',
    'scr.tab.library':   'Bibliothèque',
    'scr.tab.playlists': 'Playlists',
    'scr.tab.more':      'Plus',
    'scr.cap.player_waves':    'Lecteur · Waves',
    'scr.cap.player_classic':  'Lecteur · Classique',
    'scr.cap.lyrics':          'Paroles synchronisées',
    'scr.cap.queue':           "File d'attente",
    'scr.cap.home':            'Accueil',
    'scr.cap.search':          'Recherche',
    'scr.cap.album_detail':    'Détail Album',
    'scr.cap.artist_detail':   'Détail Artiste',
    'scr.cap.library':         'Bibliothèque',
    'scr.cap.sidebar':         'Menu latéral',
    'scr.cap.playlist_options':'Options Playlist',
    'scr.cap.playlist_edit':   'Modifier Playlist',
    'scr.cap.settings':        'Paramètres',

    'setup.label':       'Installation',
    'setup.title':       'Lancé en trois étapes.',
    'setup.subtitle':    'Aucun compte requis. Aucune synchronisation cloud. Juste votre serveur et votre musique.',
    'setup.step1.title': 'Installer Navidrome',
    'setup.step1.desc':  'Installez Navidrome ou n\'importe quel serveur compatible Subsonic.',
    'setup.step2.title': 'Télécharger Musonic',
    'setup.step2.desc':  "Téléchargez l'APK depuis GitHub Releases et installez-le.",
    'setup.step3.title': 'Connecter et lire',
    'setup.step3.desc':  "Entrez l'URL de votre serveur et vos identifiants. La bibliothèque se charge immédiatement.",

    'stack.label': 'Construit avec',
    'stack.title': 'Ouvert, moderne et rapide.',

    'cta.title':             'Prêt à reprendre votre musique ?',
    'cta.sub':               'Open source. Auto-hébergé. À vous.',
    'cta.download.android':  'Télécharger pour Android',
    'cta.download.ios':      'Sideload iOS',
    'cta.github':            'Voir sur GitHub',
  },
};

let currentLang = localStorage.getItem('musonic-lang') || 'en';

function applyLanguage(lang) {
  const t = TRANSLATIONS[lang];
  if (!t) return;

  document.documentElement.lang = lang;
  currentLang = lang;
  localStorage.setItem('musonic-lang', lang);

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (t[key] !== undefined) el.innerHTML = t[key];
  });

  // Update lang switcher active state
  document.querySelectorAll('.lang-opt').forEach((opt) => {
    opt.classList.toggle('active', opt.dataset.lang === lang);
  });
}

(function initI18n() {
  applyLanguage(currentLang);

  const btn = document.getElementById('lang-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    applyLanguage(currentLang === 'en' ? 'fr' : 'en');
  });
})();

/* ─── Screenshot tab switching ───────────────────────────────────────────────── */

(function initScreenshotTabs() {
  const tabs = document.querySelectorAll('.scr-tab');
  if (!tabs.length) return;

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      tabs.forEach((t) => {
        t.classList.toggle('active', t === tab);
        t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
      });
      document.querySelectorAll('.scr-panel').forEach((panel) => {
        const isTarget = panel.id === `panel-${target}`;
        panel.classList.toggle('active', isTarget);
        isTarget ? panel.removeAttribute('hidden') : panel.setAttribute('hidden', '');
      });
    });
  });
})();

/* ─── Scroll-reveal via IntersectionObserver ─────────────────────────────────── */

(function initReveal() {
  const elements = document.querySelectorAll('.reveal');
  if (!elements.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  elements.forEach((el) => observer.observe(el));
})();

/* ─── Sticky Navigation ──────────────────────────────────────────────────────── */

(function initNav() {
  const nav = document.querySelector('.nav');
  if (!nav) return;

  function onScroll() {
    nav.classList.toggle('scrolled', window.scrollY > 60);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

/* ─── Smooth anchor scroll (Safari fallback) ─────────────────────────────────── */

(function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (event) => {
      const targetId = anchor.getAttribute('href').slice(1);
      const target = document.getElementById(targetId);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
})();

/* ─── Ambient glow — mouse parallax on hero (desktop only) ──────────────────── */

(function initHeroParallax() {
  const hero = document.querySelector('.hero');
  if (!hero || window.matchMedia('(pointer: coarse)').matches) return;

  hero.addEventListener('mousemove', (event) => {
    const rect = hero.getBoundingClientRect();
    const x = Math.min(Math.max(((event.clientX - rect.left) / rect.width) * 100, 20), 80);
    const y = Math.min(Math.max(((event.clientY - rect.top) / rect.height) * 100, 5), 60);
    hero.style.setProperty('--hero-glow-pos', `${x}% ${y}%`);
  });

  hero.addEventListener('mouseleave', () => {
    hero.style.setProperty('--hero-glow-pos', '50% 0%');
  });
})();

/* ─── Scroll Progress Bar ────────────────────────────────────────────────────── */

(function initScrollProgress() {
  const bar = document.querySelector('.scroll-progress');
  if (!bar) return;

  function update() {
    const total = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = total > 0 ? `${(window.scrollY / total) * 100}%` : '0%';
  }

  window.addEventListener('scroll', update, { passive: true });
  update();
})();

/* ─── Lightbox ───────────────────────────────────────────────────────────────── */

(function initLightbox() {
  const lb      = document.getElementById('lightbox');
  const lbImg   = document.getElementById('lb-img');
  const lbCap   = document.getElementById('lb-caption');
  const lbClose = document.getElementById('lb-close');
  const lbPrev  = document.getElementById('lb-prev');
  const lbNext  = document.getElementById('lb-next');
  if (!lb) return;

  let frames = [];
  let idx = 0;

  function show() {
    const frame = frames[idx];
    const img = frame.querySelector('img');
    const cap = frame.querySelector('figcaption');
    lbImg.src = img.src;
    lbImg.alt = img.alt;
    lbCap.textContent = cap ? cap.textContent : '';
    lbPrev.disabled = idx === 0;
    lbNext.disabled = idx === frames.length - 1;
  }

  function open(frame, panelFrames) {
    frames = panelFrames;
    idx = frames.indexOf(frame);
    show();
    lb.removeAttribute('hidden');
    requestAnimationFrame(() => lb.classList.add('lb-visible'));
    document.body.style.overflow = 'hidden';
  }

  function close() {
    lb.classList.remove('lb-visible');
    setTimeout(() => {
      lb.setAttribute('hidden', '');
      document.body.style.overflow = '';
    }, 250);
  }

  document.querySelectorAll('.scr-strip').forEach((strip) => {
    const panelFrames = Array.from(strip.querySelectorAll('.scr-frame'));
    panelFrames.forEach((frame) => {
      frame.addEventListener('click', () => open(frame, panelFrames));
    });
  });

  lbClose.addEventListener('click', close);
  lb.addEventListener('click', (e) => { if (e.target === lb) close(); });

  lbPrev.addEventListener('click', (e) => {
    e.stopPropagation();
    if (idx > 0) { idx--; show(); }
  });

  lbNext.addEventListener('click', (e) => {
    e.stopPropagation();
    if (idx < frames.length - 1) { idx++; show(); }
  });

  document.addEventListener('keydown', (e) => {
    if (lb.hasAttribute('hidden')) return;
    if (e.key === 'Escape')     close();
    if (e.key === 'ArrowLeft'  && idx > 0)                  { idx--; show(); }
    if (e.key === 'ArrowRight' && idx < frames.length - 1)  { idx++; show(); }
  });
})();
