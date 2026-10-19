/**
 * @file LyricsView.tsx
 * @description Lyrics lines. Synced lyrics highlight the line being sung and
 *   scroll to it; clicking a line seeks there. Plain lyrics are shown as text.
 *   Used by the side panel and the full-screen player.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useRef } from 'react';
import type { StructuredLyrics } from '@musonic/core';
import { requestSeek, usePosition } from '../player/position.ts';

interface Props {
  lyrics: StructuredLyrics;
  className?: string;
}

export function LyricsView({ lyrics, className }: Props) {
  const position = usePosition();
  const activeRef = useRef<HTMLButtonElement>(null);
  const { line: lines, synced } = lyrics;
  const ms = position * 1000;
  let active = -1;
  if (synced) for (let i = 0; i < lines.length && (lines[i].start ?? 0) <= ms; i++) active = i;

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [active]);

  return (
    <div className={'lyrics' + (synced ? ' is-synced' : '') + (className ? ` ${className}` : '')}>
      {lines.map((line, i) =>
        synced ? (
          <button
            key={i}
            type="button"
            ref={i === active ? activeRef : undefined}
            className={'lyrics-line' + (i === active ? ' is-active' : i < active ? ' is-past' : '')}
            onClick={() => requestSeek((line.start ?? 0) / 1000)}>
            {line.value || '♪'}
          </button>
        ) : (
          <p key={i} className="lyrics-line">{line.value || ' '}</p>
        ),
      )}
    </div>
  );
}
