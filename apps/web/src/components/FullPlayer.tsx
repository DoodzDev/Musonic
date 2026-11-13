/**
 * @file FullPlayer.tsx
 * @description Full-screen player over the app, like the mobile one: blurred
 *   cover as the background, large cover, title, artist, like, progress,
 *   controls and volume, with the synced lyrics beside the cover (can be
 *   hidden). Can also take the whole screen (browser full screen) and open the
 *   mini player. Escape or the chevron closes it. On a phone: the cover fills the
 *   width, the lyrics or the queue take its place, a row of secondary buttons
 *   (lyrics, devices, sleep timer, queue) replaces the volume, and swiping down
 *   on the cover or the header closes it.
 * @author DoodzProg
 * @version 0.2.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { useIsPhone } from '../hooks/useIsPhone.ts';
import { tr } from '../i18n/index.ts';
import { usePlayer } from '../player/PlayerContext.tsx';
import { useLyrics } from '../player/useLyrics.ts';
import { colors } from '../theme/tokens.ts';
import { ConnectButton } from './ConnectButton.tsx';
import { Cover } from './Cover.tsx';
import { FullscreenIcon, MiniPlayerIcon } from './Icons.tsx';
import { LyricsView } from './LyricsView.tsx';
import { NowPlayingActions } from './NowPlayingActions.tsx';
import { QueuePanel } from './QueuePanel.tsx';
import { SleepTimerButton } from './SleepTimerButton.tsx';
import { ProgressBar, TransportButtons, VolumeControl } from './PlayerControls.tsx';
import { ChevronDownIcon } from './icons/ChevronDownIcon.tsx';
import { LyricsIcon } from './icons/LyricsIcon.tsx';
import { QueueIcon } from './icons/QueueIcon.tsx';

const t = tr.player;
const LYRICS_KEY = 'musonic.fullPlayerLyrics';
/** Finger travel (px) down that closes the player on a phone. */
const SWIPE_CLOSE = 80;

interface Props {
  onClose: () => void;
  onToggleMini: (() => void) | null;
  miniOpen: boolean;
}

function readShowLyrics(): boolean {
  try {
    return localStorage.getItem(LYRICS_KEY) !== '0';
  } catch {
    return true;
  }
}

export function FullPlayer({ onClose, onToggleMini, miniOpen }: Props) {
  const { client } = useApp();
  const player = usePlayer();
  const { current: song, panel } = player;
  const phone = useIsPhone();
  const lyrics = useLyrics(song);
  const swipeFrom = useRef<number | null>(null);
  const [showLyrics, setShowLyrics] = useState(readShowLyrics);
  const [fullscreen, setFullscreen] = useState(() => !!document.fullscreenElement);
  const lines = lyrics.status === 'ready' ? lyrics.data : null;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !document.fullscreenElement) onClose();
    }
    const onFullscreen = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFullscreen);
    };
  }, [onClose]);

  // Leaving the player also leaves the browser full screen.
  useEffect(() => () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else document.documentElement.requestFullscreen().catch(() => undefined);
  }

  function toggleLyrics() {
    const next = !showLyrics;
    setShowLyrics(next);
    try {
      localStorage.setItem(LYRICS_KEY, next ? '1' : '0');
    } catch {
      // Preference only.
    }
  }

  const swipe = {
    onPointerDown: (e: PointerEvent) => {
      swipeFrom.current = e.clientY;
    },
    onPointerUp: (e: PointerEvent) => {
      if (swipeFrom.current !== null && e.clientY - swipeFrom.current > SWIPE_CLOSE) onClose();
      swipeFrom.current = null;
    },
    onPointerCancel: () => {
      swipeFrom.current = null;
    },
  };

  const lyricsBody = (
    <>
      {lyrics.status === 'loading' && <p className="full-lyrics-note">{tr.page.loading}</p>}
      {lyrics.status !== 'loading' && !lines?.line.length && <p className="full-lyrics-note">{tr.lyrics.none}</p>}
      {lines && lines.line.length > 0 && <LyricsView lyrics={lines} className="lyrics-full" />}
    </>
  );

  if (phone) {
    const panelButton = (which: 'lyrics' | 'queue', label: string, icon: (color: string) => ReactNode) => (
      <button
        type="button"
        className={'icon-btn full-icon icon-mode' + (panel === which ? ' is-on' : '')}
        onClick={() => player.togglePanel(which)}
        aria-label={label}
        aria-pressed={panel === which}>
        {icon(panel === which ? colors.accent : 'currentColor')}
      </button>
    );
    return (
      <div className="full is-phone" role="dialog" aria-modal="true" aria-label={t.fullTitle}>
        {song?.coverArt && (
          <div className="full-backdrop" aria-hidden="true">
            <img src={client.coverArtUrl(song.coverArt, 128)} alt="" />
          </div>
        )}
        <div className="full-veil" aria-hidden="true" />

        <header className="full-top" {...swipe}>
          <button type="button" className="icon-btn full-icon" onClick={onClose} aria-label={t.collapse}>
            <ChevronDownIcon size={26} />
          </button>
          <span className="full-eyebrow">{panel === 'lyrics' ? t.lyrics : panel === 'queue' ? t.queue : t.fullTitle}</span>
          <span className="full-icon" aria-hidden="true" />
        </header>

        <div className="full-body">
          {panel === 'queue' ? (
            <div className="full-panel"><QueuePanel /></div>
          ) : panel === 'lyrics' ? (
            <div className="full-lyrics">{lyricsBody}</div>
          ) : (
            <div className="full-art" {...swipe}>
              <Cover coverArt={song?.coverArt} size={600} className="full-cover" eager />
            </div>
          )}
        </div>

        <footer className="full-bottom">
          <div className="full-meta">
            <span className="item-text">
              <span className="full-title">{song ? song.title : t.idle}</span>
              {song && <span className="full-artist">{song.artist}</span>}
            </span>
            <span className="full-actions">
              <NowPlayingActions song={song ?? undefined} size={24} className="icon-btn full-icon" />
            </span>
          </div>
          <ProgressBar />
          <TransportButtons size={1.5} />
          <div className="full-secondary">
            {panelButton('lyrics', t.lyrics, (c) => <LyricsIcon size={22} color={c} />)}
            <ConnectButton size={22} className="icon-btn full-icon icon-mode" />
            <SleepTimerButton size={22} className="icon-btn full-icon icon-mode" />
            {panelButton('queue', t.queue, (c) => <QueueIcon size={22} color={c} />)}
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="full" role="dialog" aria-modal="true" aria-label={t.fullTitle}>
      {song?.coverArt && (
        <div className="full-backdrop" aria-hidden="true">
          <img src={client.coverArtUrl(song.coverArt, 128)} alt="" />
        </div>
      )}
      <div className="full-veil" aria-hidden="true" />

      <header className="full-top">
        <button type="button" className="icon-btn full-icon" onClick={onClose} aria-label={t.collapse} title={`${t.collapse} (${t.keyEscape})`}>
          <ChevronDownIcon size={26} />
        </button>
        <span className="full-eyebrow">{t.fullTitle}</span>
        <span className="full-top-actions">
          {onToggleMini && (
            <button
              type="button"
              className={'icon-btn full-icon' + (miniOpen ? ' is-on' : '')}
              onClick={onToggleMini}
              aria-label={miniOpen ? t.miniClose : t.mini}
              title={miniOpen ? t.miniClose : t.mini}>
              <MiniPlayerIcon />
            </button>
          )}
          <button
            type="button"
            className="icon-btn full-icon"
            onClick={toggleFullscreen}
            aria-label={fullscreen ? t.fullscreenExit : t.fullscreen}
            title={fullscreen ? t.fullscreenExit : t.fullscreen}>
            <FullscreenIcon exit={fullscreen} />
          </button>
        </span>
      </header>

      <div className={'full-body' + (showLyrics ? ' with-lyrics' : '')}>
        <div className="full-art">
          <Cover coverArt={song?.coverArt} size={600} className="full-cover" eager />
        </div>
        {showLyrics && (
          <div className="full-lyrics">{lyricsBody}</div>
        )}
      </div>

      <footer className="full-bottom">
        <div className="full-meta">
          <span className="item-text">
            <span className="full-title">{song ? song.title : t.idle}</span>
            {song && <span className="full-artist">{song.artist}</span>}
          </span>
          <span className="full-actions">
            <NowPlayingActions song={song ?? undefined} size={24} className="icon-btn full-icon" />
          </span>
        </div>
        <ProgressBar />
        <div className="full-controls">
          <span className="full-side">
            <button
              type="button"
              className={'icon-btn full-icon icon-mode' + (showLyrics ? ' is-on' : '')}
              onClick={toggleLyrics}
              aria-label={t.lyrics}
              aria-pressed={showLyrics}
              title={t.lyrics}>
              <LyricsIcon size={22} color={showLyrics ? colors.accent : 'currentColor'} />
            </button>
            <SleepTimerButton size={22} className="icon-btn full-icon icon-mode" />
          </span>
          <TransportButtons size={1.4} />
          <span className="full-side full-volume">
            <VolumeControl />
          </span>
        </div>
      </footer>
    </div>
  );
}
