/**
 * @file LyricsPanel.tsx
 * @description Lyrics of the current track in the right panel. Synced lyrics
 *   highlight the line being sung and scroll to it; clicking a line seeks there.
 *   Plain lyrics are shown as text.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { TTL_LONG, useCachedQuery } from '../hooks/useCachedQuery.ts';
import { fr } from '../i18n/fr.ts';
import { usePlayer } from '../player/PlayerContext.tsx';
import { requestSeek, usePosition } from '../player/position.ts';
import { CloseIcon } from './icons/CloseIcon.tsx';

const t = fr.lyrics;

export function LyricsPanel() {
  const { client } = useApp();
  const { current, setPanel } = usePlayer();
  const position = usePosition();
  const activeRef = useRef<HTMLButtonElement>(null);
  const lyrics = useCachedQuery(current ? `lyrics:${current.id}` : null, TTL_LONG, () =>
    client.getLyrics({ id: current!.id, artist: current!.artist, title: current!.title }),
  );
  const data = lyrics.status === 'ready' ? lyrics.data : null;
  const lines = data?.line ?? [];
  const synced = !!data?.synced;
  const ms = position * 1000;
  let active = -1;
  if (synced) for (let i = 0; i < lines.length && (lines[i].start ?? 0) <= ms; i++) active = i;

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [active]);

  return (
    <div className="queue" aria-label={t.title}>
      <div className="queue-head">
        <h2 className="queue-title">{t.title}</h2>
        <button type="button" className="icon-btn" onClick={() => setPanel(null)} aria-label={t.close} title={t.close}>
          <CloseIcon size={18} />
        </button>
      </div>
      {!current && <p className="queue-empty muted">{t.idle}</p>}
      {current && lyrics.status === 'loading' && <p className="queue-empty muted">{fr.page.loading}</p>}
      {current && (lyrics.status === 'error' || (lyrics.status === 'ready' && lines.length === 0)) && (
        <p className="queue-empty muted">{t.none}</p>
      )}
      {lines.length > 0 && (
        <div className={'lyrics' + (synced ? ' is-synced' : '')}>
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
              <p key={i} className="lyrics-line">{line.value || ' '}</p>
            ),
          )}
        </div>
      )}
    </div>
  );
}
