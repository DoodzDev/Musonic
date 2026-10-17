/**
 * @file QueuePanel.tsx
 * @description Right-hand queue panel, in the same zones as the mobile queue:
 *   now playing, added by you, next from the context (with Magic suggestions)
 *   and autoplay. Clicking a track plays it (the ones before are skipped);
 *   each track to come can be removed.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { entryKey } from '@musonic/core/playback';
import { fr } from '../i18n/fr.ts';
import { usePlayer, type WebTrack } from '../player/PlayerContext.tsx';
import { Cover } from './Cover.tsx';
import { Equalizer } from './Equalizer.tsx';
import { CloseIcon } from './icons/CloseIcon.tsx';
import { SparkleIcon } from './icons/SparkleIcon.tsx';

const t = fr.queue;

function Row({ track, current }: { track: WebTrack; current?: boolean }) {
  const { jumpTo, remove, playing } = usePlayer();
  const key = entryKey(track);
  return (
    <li className={'queue-row' + (current ? ' is-current' : '')}>
      <button type="button" className="queue-play" onClick={() => !current && jumpTo(key)} disabled={current} aria-label={`${t.play} ${track.title}`}>
        <Cover coverArt={track.coverArt} size={40} className="cover-40" />
        <span className="item-text">
          <span className={'item-title' + (current ? ' is-playing' : '')}>{track.title}</span>
          <span className="item-sub">
            {track.isMagic && (
              <span className="queue-magic" title={t.magic}><SparkleIcon size={11} /> {t.magic} · </span>
            )}
            {track.artist}
          </span>
        </span>
        {current && <Equalizer playing={playing} label={fr.table.nowPlaying} />}
      </button>
      {!current && (
        <button type="button" className="icon-btn queue-remove" onClick={() => remove(key)} aria-label={`${t.remove} ${track.title}`} title={t.remove}>
          <CloseIcon size={16} />
        </button>
      )}
    </li>
  );
}

function Section({ title, tracks, action }: { title: string; tracks: WebTrack[]; action?: React.ReactNode }) {
  if (tracks.length === 0) return null;
  return (
    <section className="queue-section">
      <div className="queue-section-head">
        <h3 className="section-label">{title}</h3>
        {action}
      </div>
      <ul className="queue-list">
        {tracks.map((track) => <Row key={entryKey(track)} track={track} />)}
      </ul>
    </section>
  );
}

export function QueuePanel() {
  const { queue, current, clearQueue, setPanel } = usePlayer();
  const empty = !current && queue.userQueue.length + queue.upcoming.length + queue.autoplay.length === 0;
  const hasUpcoming = queue.userQueue.length + queue.upcoming.length + queue.autoplay.length > 0;

  return (
    <div className="queue" aria-label={t.title}>
      <div className="queue-head">
        <h2 className="queue-title">{t.title}</h2>
        <button type="button" className="icon-btn" onClick={() => setPanel(null)} aria-label={t.close} title={t.close}>
          <CloseIcon size={18} />
        </button>
      </div>

      {empty ? (
        <p className="queue-empty muted">{t.empty}</p>
      ) : (
        <>
          {current && (
            <section className="queue-section">
              <h3 className="section-label">{t.nowPlaying}</h3>
              <ul className="queue-list"><Row track={current} current /></ul>
            </section>
          )}
          <Section
            title={t.addedByYou}
            tracks={queue.userQueue}
            action={hasUpcoming ? <button type="button" className="queue-clear" onClick={clearQueue}>{t.clear}</button> : undefined}
          />
          <Section title={t.next} tracks={queue.upcoming} action={queue.userQueue.length === 0 && hasUpcoming ? <button type="button" className="queue-clear" onClick={clearQueue}>{t.clear}</button> : undefined} />
          <Section title={t.autoplay} tracks={queue.autoplay} />
        </>
      )}
    </div>
  );
}
