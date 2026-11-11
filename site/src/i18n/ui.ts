/**
 * @file ui.ts
 * @description Words shared by every showcase page (menu, footer, language switch), and the
 *   path of a page in the other language.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */
export type Lang = 'en' | 'fr';

export const ui = {
  en: {
    skip: 'Skip to content',
    nav: { mobile: 'Mobile app', web: 'Web', server: 'Server', docs: 'Documentation', about: 'About' },
    otherLang: 'Français',
    footer: { releases: 'Releases', issue: 'Report a problem', license: 'License', madeBy: 'Made by' },
  },
  fr: {
    skip: 'Aller au contenu',
    nav: { mobile: 'Application mobile', web: 'Web', server: 'Serveur', docs: 'Documentation', about: 'À propos' },
    otherLang: 'English',
    footer: { releases: 'Versions', issue: 'Signaler un problème', license: 'Licence', madeBy: 'Fait par' },
  },
} as const;

/** `/server/` → `/fr/server/` and back. */
export function localePath(path: string, lang: Lang): string {
  const bare = path.replace(/^\/fr(\/|$)/, '/');
  return lang === 'fr' ? `/fr${bare === '/' ? '/' : bare}` : bare;
}
