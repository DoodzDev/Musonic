/**
 * @file TextDialog.tsx
 * @description Small modal asking for one line of text (new playlist name,
 *   rename). Enter confirms, Escape or a click outside cancels.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useState } from 'react';
import { tr } from '../i18n/index.ts';

interface Props {
  title: string;
  label: string;
  initial?: string;
  confirm: string;
  onConfirm: (value: string) => void;
  onClose: () => void;
}

export function TextDialog({ title, label, initial = '', confirm, onConfirm, onClose }: Props) {
  const [value, setValue] = useState(initial);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ready = value.trim().length > 0;
  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onConfirm(value.trim());
        }}>
        <h2 className="dialog-title">{title}</h2>
        <label className="field-label">
          <span>{label}</span>
          <span className="field">
            <input value={value} onChange={(e) => setValue(e.target.value)} autoFocus onFocus={(e) => e.currentTarget.select()} />
          </span>
        </label>
        <div className="dialog-actions">
          <button type="button" className="btn-quiet" onClick={onClose}>{tr.common.cancel}</button>
          <button type="submit" className="btn-primary btn-play" disabled={!ready}>{confirm}</button>
        </div>
      </form>
    </div>
  );
}
