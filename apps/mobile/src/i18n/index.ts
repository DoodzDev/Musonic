/**
 * @file index.ts
 * @description i18n entry point. Exports `useT()` (React hook) and `getT()`
 *   (imperative, for use outside components) to return the current locale object.
 *   Language selection is driven by settingsStore.locale; `system` follows
 *   the phone's language (French, else English).
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import {t as fr} from './fr';
import {en} from './en';
import {useSettingsStore, type Locale, type LocalePref} from '../store/settingsStore';

type Dict = typeof fr;

const dicts: Record<string, Dict> = {
  fr,
  en: en as unknown as Dict,
};

/** The phone's language, read once: French when it is French, English otherwise. */
const PHONE_LOCALE: Locale = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  } catch {
    return 'en';
  }
})();

/** The language actually used for a stored choice. */
export function resolveLocale(pref: LocalePref): Locale {
  return pref === 'system' ? PHONE_LOCALE : pref;
}

export function useT(): Dict {
  const locale = useSettingsStore(s => s.locale);
  return dicts[resolveLocale(locale)] ?? fr;
}

export function getT(): Dict {
  const locale = useSettingsStore.getState().locale;
  return dicts[resolveLocale(locale)] ?? fr;
}
