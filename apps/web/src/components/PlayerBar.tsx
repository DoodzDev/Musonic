/**
 * @file PlayerBar.tsx
 * @description Bottom player bar: current track, shuffle (off / on / Magic) and
 *   repeat (none / all / one) like the mobile app, progress and volume, the
 *   queue and lyrics panels, the floating mini player and the full-screen
 *   player (also opened by clicking the cover). Audio lives in AudioEngine.
 * @author DoodzProg
 * @version 0.5.0
 * @license CC-BY-NC-4.0
 */

import { Link } from 'react-router';
import { tr } from '../i18n/index.ts';
import { useTransport } from '../player/transport.ts';
import { usePlayer } from '../player/PlayerContext.tsx';
import { colors } from '../theme/tokens.ts';
import { Cover } from './Cover.tsx';
import { FullscreenIcon, MiniPlayerIcon } from './Icons.tsx';
import { ProgressBar, TransportButtons, VolumeControl } from './PlayerControls.tsx';
import { AlertIcon } from './icons/AlertIcon.tsx';
import { LyricsIcon } from './icons/LyricsIcon.tsx';
import { QueueIcon } from './icons/QueueIcon.tsx';

const t = tr.player;

interface Props {
  onExpand: () => void;
  /** Null when the browser cannot open a mini player window. */
  onToggleMini: (() => void) | null;
  miniOpen: boolean;
}

export function PlayerBar({ onExpand, onToggleMini, miniOpen }: Props) {
  const player = usePlayer();
  const { failed } = useTransport();
  const { current: song, panel } = player;

  return (
    <footer className="player-bar">
      <div className="player-inner">
        <div className="player-track">
          <button type="button" className="cover-btn" onClick={onExpand} disabled={!song} aria-label={t.expand} title={t.expand}>
            <Cover coverArt={song?.coverArt} size={56} className="cover-60" eager />
          </button>
          <span className="item-text">
            {song?.albumId ? (
              <Link to={`/album/${song.albumId}`} className="item-title link">{song.title}</Link>
            ) : (
              <span className="item-title">{song ? song.title : t.idle}</span>
            )}
            {song &&
              (song.artistId ? (
                <Link to={`/artist/${song.artistId}`} className="item-sub link">{song.artist}</Link>
              ) : (
                <span className="item-sub">{song.artist}</span>
              ))}
            {failed && (
              <span className="player-error" role="alert"><AlertIcon size={13} triangle /> {t.error}</span>
            )}
          </span>
        </div>

        <div className="player-center">
          <TransportButtons />
          <ProgressBar />
        </div>

        <div className="player-side">
          <button
            type="button"
            className={'icon-btn icon-mode' + (panel === 'lyrics' ? ' is-on' : '')}
            onClick={() => player.togglePanel('lyrics')}
            aria-label={t.lyrics}
            aria-pressed={panel === 'lyrics'}
            title={t.lyrics}>
            <LyricsIcon size={20} color={panel === 'lyrics' ? colors.accent : 'currentColor'} />
            {panel === 'lyrics' && <span className="icon-dot" />}
          </button>
          <button
            type="button"
            className={'icon-btn icon-mode' + (panel === 'queue' ? ' is-on' : '')}
            onClick={() => player.togglePanel('queue')}
            aria-label={t.queue}
            aria-pressed={panel === 'queue'}
            title={t.queue}>
            <QueueIcon size={20} color={panel === 'queue' ? colors.accent : 'currentColor'} />
            {panel === 'queue' && <span className="icon-dot" />}
          </button>
          {onToggleMini && (
            <button
              type="button"
              className={'icon-btn icon-mode' + (miniOpen ? ' is-on' : '')}
              onClick={onToggleMini}
              aria-label={miniOpen ? t.miniClose : t.mini}
              aria-pressed={miniOpen}
              title={miniOpen ? t.miniClose : t.mini}>
              <MiniPlayerIcon />
              {miniOpen && <span className="icon-dot" />}
            </button>
          )}
          <button type="button" className="icon-btn" onClick={onExpand} disabled={!song} aria-label={t.expand} title={t.expand}>
            <FullscreenIcon />
          </button>
          <VolumeControl />
        </div>
      </div>
    </footer>
  );
}
