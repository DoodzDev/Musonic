/**
 * @file SettingsDialog.tsx
 * @description Settings of the web client, opened from the profile menu.
 *   For now: the language (English / French), shared with the website.
 *   Escape or a click outside closes it.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useEffect } from 'react';
import { lang, setLang, tr, type Lang } from '../i18n/index.ts';
import { CloseIcon } from './icons/CloseIcon.tsx';

const t = tr.settings;
// Each language is named in itself, so it can be found whatever the current one.
const LANGUAGES: { id: Lang; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'fr', name: 'Français' },
];

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={t.title}>
        <div className="dialog-head">
          <h2 className="dialog-title">{t.title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t.close} title={t.close}>
            <CloseIcon size={18} />
          </button>
        </div>
        <div className="setting">
          <span className="setting-label" id="setting-language">{t.language}</span>
          <div className="chips" role="radiogroup" aria-labelledby="setting-language">
            {LANGUAGES.map((l) => (
              <button
                key={l.id}
                type="button"
                role="radio"
                aria-checked={lang === l.id}
                className={'chip' + (lang === l.id ? ' is-on' : '')}
                lang={l.id}
                onClick={() => setLang(l.id)}>
                {l.name}
              </button>
            ))}
          </div>
          <p className="setting-hint">{t.languageHint}</p>
        </div>
      </div>
    </div>
  );
}
