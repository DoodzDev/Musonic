/**
 * @file PlaylistEditor.tsx
 * @description Track list of a playlist in edit mode: drag a row by its handle
 *   (or focus the handle and use the arrow keys) to move it, "−" to remove it.
 *   Changes stay local until the page saves them.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useState, type DragEvent } from 'react';
import type { Song } from '@musonic/core';
import { tr } from '../i18n/index.ts';
import { formatTime } from '../lib/format.ts';
import { Cover } from './Cover.tsx';
import { DragHandleIcon } from './icons/DragHandleIcon.tsx';
import { MinusCircleIcon } from './icons/MinusCircleIcon.tsx';

/** A song of the playlist being edited; `key` stays the same when it moves (a song can be there twice). */
export interface EditItem {
  key: number;
  song: Song;
}

interface Props {
  items: EditItem[];
  onChange: (items: EditItem[]) => void;
}

const t = tr.playlist;

/** `items` with the one at `from` moved to `to`. */
function moved(items: EditItem[], from: number, to: number): EditItem[] {
  const next = items.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function PlaylistEditor({ items, onChange }: Props) {
  // Row being dragged, and the gap it would land in (0 = before the first row).
  const [drag, setDrag] = useState<{ from: number; gap: number | null } | null>(null);

  function onDragOver(event: DragEvent<HTMLLIElement>, index: number) {
    if (!drag) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const box = event.currentTarget.getBoundingClientRect();
    const gap = event.clientY > box.top + box.height / 2 ? index + 1 : index;
    if (drag.gap !== gap) setDrag({ ...drag, gap });
  }

  function drop() {
    if (drag && drag.gap !== null) {
      const to = drag.gap > drag.from ? drag.gap - 1 : drag.gap;
      if (to !== drag.from) onChange(moved(items, drag.from, to));
    }
    setDrag(null);
  }

  return (
    <ul className="edit-list" aria-label={t.editList}>
      {items.map((item, i) => {
        const target = drag && drag.from !== i ? (drag.gap === i ? ' drop-before' : drag.gap === i + 1 && i === items.length - 1 ? ' drop-after' : '') : '';
        return (
          <li
            key={item.key}
            className={'edit-row' + (drag?.from === i ? ' is-dragging' : '') + target}
            onDragOver={(e) => onDragOver(e, i)}
            onDrop={(e) => {
              e.preventDefault();
              drop();
            }}>
            <button
              type="button"
              className="icon-btn edit-handle"
              draggable
              aria-label={t.move(item.song.title)}
              title={t.moveHint}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', item.song.title);
                const row = e.currentTarget.closest('li');
                if (row) e.dataTransfer.setDragImage(row, 24, row.clientHeight / 2);
                setDrag({ from: i, gap: null });
              }}
              onDragEnd={() => setDrag(null)}
              onKeyDown={(e) => {
                const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : -1;
                if (to < 0 || to >= items.length) return;
                e.preventDefault();
                onChange(moved(items, i, to));
                // Keep the focus on the moved row's handle.
                requestAnimationFrame(() =>
                  (document.querySelectorAll<HTMLButtonElement>('.edit-handle')[to])?.focus(),
                );
              }}>
              <DragHandleIcon size={20} />
            </button>
            <Cover coverArt={item.song.coverArt} size={40} className="cover-40" />
            <span className="item-text">
              <span className="item-title">{item.song.title}</span>
              <span className="item-sub">{item.song.artist}</span>
            </span>
            <span className="item-sub edit-duration">{formatTime(item.song.duration)}</span>
            <button
              type="button"
              className="icon-btn edit-remove"
              aria-label={t.removeSong(item.song.title)}
              title={t.removeHint}
              onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <MinusCircleIcon size={20} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
