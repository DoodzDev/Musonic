/**
 * @file LyricsPanel.tsx
 * @description Lyrics of the current track in the right panel (server, then LRCLIB).
 * @author DoodzProg
 * @version 0.2.0
 * @license CC-BY-NC-4.0
 */

import { tr } from '../i18n/index.ts';
import { usePlayer } from '../player/PlayerContext.tsx';
import { useLyrics } from '../player/useLyrics.ts';
import { LyricsView } from './LyricsView.tsx';
import { CloseIcon } from './icons/CloseIcon.tsx';

const t = tr.lyrics;

export function LyricsPanel() {
  const { current, setPanel } = usePlayer();
  const lyrics = useLyrics(current);
  const data = lyrics.status === 'ready' ? lyrics.data : null;

  return (
    <div className="queue" aria-label={t.title}>
      <div className="queue-head">
        <h2 className="queue-title">{t.title}</h2>
        <button type="button" className="icon-btn" onClick={() => setPanel(null)} aria-label={t.close} title={t.close}>
          <CloseIcon size={18} />
        </button>
      </div>
      {!current && <p className="queue-empty muted">{t.idle}</p>}
      {current && lyrics.status === 'loading' && <p className="queue-empty muted">{tr.page.loading}</p>}
      {current && lyrics.status !== 'loading' && !data?.line.length && <p className="queue-empty muted">{t.none}</p>}
      {data && data.line.length > 0 && <LyricsView lyrics={data} />}
    </div>
  );
}
