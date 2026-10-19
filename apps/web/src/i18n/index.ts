/**
 * @file index.ts
 * @description Language of the web client, chosen once at start: the choice
 *   saved under `musonic-lang` (shared with the Musonic website, same origin
 *   on GitHub Pages), else the browser language (French → French, otherwise
 *   English). Changing it saves the choice and reloads the page.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { en } from './en.ts';
import { fr } from './fr.ts';

export type Lang = 'en' | 'fr';

/** Same key and rule as the website (docs/assets/js/main.js). */
const LANG_KEY = 'musonic-lang';

function detect(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'en' || saved === 'fr') return saved;
  } catch {
    // Storage unavailable: fall back to the browser language.
  }
  return (navigator.language || '').toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export const lang: Lang = detect();

/** Strings of the active language. */
export const tr = lang === 'fr' ? fr : en;

document.documentElement.lang = lang;

export function setLang(next: Lang): void {
  if (next === lang) return;
  try {
    localStorage.setItem(LANG_KEY, next);
  } catch {
    // Not saved: the language still changes until the next visit.
  }
  location.reload();
}
