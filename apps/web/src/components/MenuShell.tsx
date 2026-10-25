/**
 * @file MenuShell.tsx
 * @description Frame of the right-click menus (cards, pages): placed at the
 *   pointer and kept inside the window, closes on Escape or a press outside.
 *   Same look as the track menu.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { MENU_CLASS } from '../player/contextMenu.ts';

const MARGIN = 8;

interface Props {
  x: number;
  y: number;
  label: string;
  onClose: () => void;
  children: ReactNode;
}

export function MenuShell({ x, y, label, onClose, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const left = Math.min(x, window.innerWidth - box.width - MARGIN);
    const top = y + box.height > window.innerHeight - MARGIN ? Math.max(MARGIN, y - box.height) : y;
    setPos({ left: Math.max(MARGIN, left), top });
  }, [x, y]);

  useEffect(() => {
    function onPointer(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  return (
    <div className={MENU_CLASS} role="menu" aria-label={label} ref={ref} style={pos}>
      {children}
    </div>
  );
}

/** One row of a menu. */
export function MenuRow({ onClick, children, destructive }: { onClick: () => void; children: ReactNode; destructive?: boolean }) {
  return (
    <button type="button" className={'menu-row' + (destructive ? ' is-destructive' : '')} role="menuitem" onClick={onClick}>
      {children}
    </button>
  );
}
