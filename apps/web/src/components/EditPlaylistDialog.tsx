/**
 * @file EditPlaylistDialog.tsx
 * @description Edits a playlist's name and description (optional). Saved on
 *   the server (Subsonic "comment"), so every client sees them, the mobile app
 *   included. Escape or a click outside cancels.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useState } from 'react';
import { tr } from '../i18n/index.ts';

const t = tr.playlist;

interface Props {
  name: string;
  description: string;
  onSave: (changes: { name: string; comment: string }) => void;
  onClose: () => void;
}

export function EditPlaylistDialog({ name: initialName, description, onSave, onClose }: Props) {
  const [name, setName] = useState(initialName);
  const [comment, setComment] = useState(description);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ready = name.trim().length > 0;
  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t.edit}
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onSave({ name: name.trim(), comment: comment.trim() });
        }}>
        <h2 className="dialog-title">{t.edit}</h2>
        <label className="field-label">
          <span>{tr.library.newPlaylistLabel}</span>
          <span className="field">
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </span>
        </label>
        <label className="field-label">
          <span>{t.description}</span>
          <span className="field field-area">
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={4} placeholder={t.descriptionPlaceholder} />
          </span>
        </label>
        <p className="setting-hint">{t.coverNote}</p>
        <div className="dialog-actions">
          <button type="button" className="btn-quiet" onClick={onClose}>{tr.common.cancel}</button>
          <button type="submit" className="btn-primary btn-play" disabled={!ready}>{tr.common.save}</button>
        </div>
      </form>
    </div>
  );
}
