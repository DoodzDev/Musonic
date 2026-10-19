/**
 * @file ResizeHandle.tsx
 * @description Vertical handle between two panels, like a table column border
 *   in a word processor: drag to change the panel's width, double-click to
 *   reset it, arrow keys when focused. The width lives in usePanelWidth.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { usePanelWidth } from '../hooks/usePanelWidth.ts';

interface Props {
  panel: ReturnType<typeof usePanelWidth>;
  /** The panel is on the left of the handle (grows to the right) or on its right. */
  side: 'left' | 'right';
  label: string;
}

export function ResizeHandle({ panel, side, label }: Props) {
  const [dragging, setDragging] = useState(false);
  const sign = side === 'left' ? 1 : -1;

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = panel.width;
    let last = startWidth;
    setDragging(true);
    const onMove = (e: globalThis.PointerEvent) => {
      last = startWidth + sign * (e.clientX - startX);
      panel.set(last, false);
    };
    const onUp = () => {
      panel.set(last, true);
      setDragging(false);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 40 : 10;
    if (event.key === 'ArrowLeft') panel.set(panel.width - sign * step, true);
    else if (event.key === 'ArrowRight') panel.set(panel.width + sign * step, true);
    else return;
    event.preventDefault();
  }

  return (
    <div
      className={'resize-handle' + (dragging ? ' is-dragging' : '')}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={panel.width}
      aria-valuemin={panel.limits.min}
      aria-valuemax={panel.limits.max}
      tabIndex={0}
      title={label}
      onPointerDown={onPointerDown}
      onDoubleClick={() => panel.set(panel.limits.initial, true)}
      onKeyDown={onKeyDown}
    />
  );
}
