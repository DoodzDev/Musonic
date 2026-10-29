/**
 * @file SettingsDialog.tsx
 * @description Settings of the web client, opened from the profile menu:
 *   the language (English / French), shared with the website, and the
 *   crossfade between tracks (0 to 12 s, remembered in the browser).
 *   Escape or a click outside closes it.
 * @author DoodzProg
 * @version 0.2.0
 * @license CC-BY-NC-4.0
 */

import { useEffect } from 'react';
import { MAX_CROSSFADE } from '@musonic/core';
import { lang, setLang, tr, type Lang } from '../i18n/index.ts';
import { setCrossfade, useCrossfade } from '../player/crossfade.ts';
import { CloseIcon } from './icons/CloseIcon.tsx';
import { Slider } from './Slider.tsx';

const t = tr.settings;
// Each language is named in itself, so it can be found whatever the current one.
const LANGUAGES: { id: Lang; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'fr', name: 'Français' },
];

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const crossfade = useCrossfade();
  const crossfadeText = crossfade > 0 ? t.crossfadeSeconds(crossfade) : t.crossfadeOff;

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
        <div className="setting">
          <span className="setting-label">{t.crossfade}</span>
          <div className="setting-slider">
            <Slider value={crossfade} max={MAX_CROSSFADE} step={1} label={t.crossfade} valueText={crossfadeText} onChange={setCrossfade} />
            <span className="setting-value" aria-hidden="true">{crossfadeText}</span>
          </div>
          <p className="setting-hint">{t.crossfadeHint}</p>
        </div>
      </div>
    </div>
  );
}
