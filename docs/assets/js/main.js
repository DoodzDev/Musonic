/**
 * @file main.js
 * @description Website: the language (both are in the page, `data-l`; the
 *   choice is kept in `musonic-lang`, shared with the web client), the latest
 *   mobile and web versions read from GitHub releases (tags `mobile-v…`,
 *   `web-v…`, with the web download link), the side table of contents that
 *   follows the reading, the portrait / landscape screenshot switch, the
 *   screenshot viewer (full screen, previous / next, keys and swipe), and the
 *   tabs of the benchmark results.
 * @author DoodzProg
 * @version 3.0.0
 * @license CC-BY-NC-4.0
 */

const LANG_KEY = 'musonic-lang';

function readStored(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function store(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private mode */ }
}

function applyLanguage(next) {
  document.documentElement.lang = next;
  document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === next)));
}

function initLanguage() {
  // The page already picked one in <head> (no flash): show it on the switch.
  applyLanguage(document.documentElement.lang === 'fr' ? 'fr' : 'en');
  document.querySelectorAll('[data-lang]').forEach((b) => {
    b.addEventListener('click', () => { applyLanguage(b.dataset.lang); store(LANG_KEY, b.dataset.lang); });
  });
}

/** Latest published releases: tags `mobile-vX.Y.Z` and `web-vX.Y.Z` (one repository, several apps). */
async function loadVersions() {
  try {
    const res = await fetch('https://api.github.com/repos/DoodzProg/Musonic/releases?per_page=30');
    if (!res.ok) return;
    const releases = await res.json();
    const pick = (prefix) => releases.find((r) => !r.draft && !r.prerelease && r.tag_name.startsWith(prefix));
    const mobile = pick('mobile-v');
    if (mobile) document.querySelectorAll('.js-version').forEach((el) => { el.textContent = mobile.tag_name.replace('mobile-v', ''); });
    const web = pick('web-v');
    if (web) {
      document.querySelectorAll('.js-web-version').forEach((el) => { el.textContent = web.tag_name.replace('web-v', ''); });
      // The web release is never "Latest" (that one stays mobile): link its zip directly.
      const zip = (web.assets || []).find((a) => a.name === 'Musonic-Web.zip');
      document.querySelectorAll('.js-web-download').forEach((el) => { el.href = zip ? zip.browser_download_url : web.html_url; });
    }
  } catch { /* offline or rate-limited: the generic labels stay */ }
}

/** The contents link of the section being read. */
function initContents() {
  const links = [...document.querySelectorAll('.toc a[href^="#"]')];
  if (!links.length || !('IntersectionObserver' in window)) return;
  const sections = links.map((a) => document.getElementById(a.hash.slice(1))).filter(Boolean);
  const visible = new Set();
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)));
    const current = sections.find((s) => visible.has(s));
    if (current) links.forEach((a) => a.classList.toggle('on', a.hash === `#${current.id}`));
  }, { rootMargin: '-80px 0px -60% 0px' });
  sections.forEach((s) => observer.observe(s));
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

/** Tabs inside a card (benchmark results): click, or ← → once a tab has the focus. */
function initTabs() {
  document.querySelectorAll('[data-tabs]').forEach((box) => {
    const tabs = [...box.querySelectorAll('[role="tab"]')];
    const select = (tab) => {
      tabs.forEach((x) => {
        const on = x === tab;
        x.setAttribute('aria-selected', String(on));
        x.tabIndex = on ? 0 : -1;
        document.getElementById(x.getAttribute('aria-controls')).hidden = !on;
      });
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', (e) => {
        const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!step) return;
        const next = tabs[(i + step + tabs.length) % tabs.length];
        select(next);
        next.focus();
      });
    });
  });
}

/** Screenshots open full screen; ← → (or a swipe) go through the set they belong to. */
function initViewer() {
  let box = null;
  let list = [];
  let at = 0;
  const show = () => {
    const img = list[at];
    box.querySelector('img').src = img.currentSrc || img.src;
    box.querySelector('img').alt = img.alt;
    const cap = img.closest('figure')?.querySelector('figcaption');
    box.querySelector('.viewer__cap').innerHTML = cap ? cap.innerHTML : '';
    box.querySelector('.viewer__count').textContent = `${at + 1} / ${list.length}`;
  };
  const go = (step) => { at = (at + step + list.length) % list.length; show(); };
  const close = () => { box.hidden = true; document.body.style.overflow = ''; };
  const onKey = (e) => {
    if (!box || box.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') go(-1);
    if (e.key === 'ArrowRight') go(1);
  };
  const build = () => {
    box = document.createElement('div');
    box.className = 'viewer';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.innerHTML = `
      <button type="button" class="viewer__close round" aria-label="Close">✕</button>
      <button type="button" class="viewer__nav viewer__prev round" aria-label="Previous">‹</button>
      <figure class="viewer__fig"><img alt="" /><figcaption><span class="viewer__cap"></span> · <span class="viewer__count"></span></figcaption></figure>
      <button type="button" class="viewer__nav viewer__next round" aria-label="Next">›</button>`;
    box.querySelector('.viewer__close').addEventListener('click', close);
    box.querySelector('.viewer__prev').addEventListener('click', () => go(-1));
    box.querySelector('.viewer__next').addEventListener('click', () => go(1));
    box.addEventListener('click', (e) => { if (e.target === box) close(); });
    let startX = null;
    box.addEventListener('pointerdown', (e) => { startX = e.clientX; });
    box.addEventListener('pointerup', (e) => {
      if (startX === null) return;
      const dx = e.clientX - startX;
      startX = null;
      if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(box);
  };
  document.querySelectorAll('.shots img, .zoom').forEach((img) => {
    img.style.cursor = 'zoom-in';
    img.addEventListener('click', () => {
      if (!box) build();
      const set = img.closest('.shots') || img.closest('[data-viewer]') || img.parentElement;
      list = [...set.querySelectorAll('img')];
      at = list.indexOf(img);
      box.hidden = false;
      document.body.style.overflow = 'hidden';
      show();
    });
  });
}

initLanguage();
initContents();
initShots();
initTabs();
initViewer();
loadVersions();
