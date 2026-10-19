/**
 * @file ConfirmDialog.tsx
 * @description Small modal asking the user to confirm an action, with an
 *   optional warning icon. Escape or a click outside cancels.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, type ReactNode } from 'react';
import { tr } from '../i18n/index.ts';
import { AlertIcon } from './icons/AlertIcon.tsx';

interface Props {
  title: string;
  children: ReactNode;
  confirm: string;
  warning?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({ title, children, confirm, warning, onConfirm, onClose }: Props) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label={title}>
        <h2 className="dialog-title dialog-title-icon">
          {warning && <AlertIcon size={22} triangle />}
          {title}
        </h2>
        <div className="dialog-body">{children}</div>
        <div className="dialog-actions">
          <button type="button" className="btn-quiet" onClick={onClose} autoFocus>{tr.common.cancel}</button>
          <button type="button" className="btn-primary btn-play" onClick={onConfirm}>{confirm}</button>
        </div>
      </div>
    </div>
  );
}
