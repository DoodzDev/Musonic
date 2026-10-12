/**
 * @file index.ts
 * @description i18n entry point. Exports `useT()` (React hook) and `getT()`
 *   (imperative, for use outside components) to return the current locale object.
 *   Language selection is driven by settingsStore.language.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {t as fr} from './fr';
import {en} from './en';
import {useSettingsStore} from '../store/settingsStore';

type Dict = typeof fr;

const dicts: Record<string, Dict> = {
  fr,
  en: en as unknown as Dict,
};

export function useT(): Dict {
  const locale = useSettingsStore(s => s.locale);
  return dicts[locale] ?? fr;
}

export function getT(): Dict {
  const locale = useSettingsStore.getState().locale;
  return dicts[locale] ?? fr;
}
