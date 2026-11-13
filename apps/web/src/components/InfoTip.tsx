/**
 * @file InfoTip.tsx
 * @description A circled "i" next to a setting: its explanation shows only when
 *   asked (click or tap, again to hide; Escape or a click elsewhere closes it), so
 *   the settings stay light.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useId, useRef, useState } from 'react';
import { tr } from '../i18n/index.ts';
import { InfoIcon } from './icons/InfoIcon.tsx';

export function InfoTip({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape, true);
    };
  }, [open]);

  return (
    <span className="info-tip" ref={box}>
      <button
        type="button"
        className={'info-btn' + (open ? ' is-on' : '')}
        aria-label={tr.settings.about(label)}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}>
        <InfoIcon size={16} />
      </button>
      {open && (
        <span className="info-bubble" id={id} role="note">
          {text}
        </span>
      )}
    </span>
  );
}
