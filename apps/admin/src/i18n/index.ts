/**
 * @file index.ts
 * @description Language of the console: the choice saved in this browser, else the browser's
 *   language (French → French, otherwise English). Adding a language = one file with the same
 *   keys as fr.ts, listed in LANGS. Changing it saves the choice and reloads the page.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { en } from './en.ts';
import { fr, type Dict } from './fr.ts';

export const LANGS = { fr, en } as const;
export type Lang = keyof typeof LANGS;

/** Same key as Musonic Web and the website. */
const LANG_KEY = 'musonic-lang';

function detect(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && saved in LANGS) return saved as Lang;
  } catch {
    // Storage unavailable: the browser language.
  }
  return (navigator.language || '').toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export const lang: Lang = detect();
export const t: Dict = LANGS[lang];
document.documentElement.lang = lang;

export function setLang(next: Lang) {
  try {
    localStorage.setItem(LANG_KEY, next);
  } catch {
    // Not kept: this page only.
  }
  location.reload();
}
