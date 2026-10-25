/**
 * @file FullPlayer.tsx
 * @description Full-screen player over the app, like the mobile one: blurred
 *   cover as the background, large cover, title, artist, like, progress,
 *   controls and volume, with the synced lyrics beside the cover (can be
 *   hidden). Can also take the whole screen (browser full screen) and open the
 *   mini player. Escape or the chevron closes it.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { tr } from '../i18n/index.ts';
import { usePlayer } from '../player/PlayerContext.tsx';
import { useLyrics } from '../player/useLyrics.ts';
import { colors } from '../theme/tokens.ts';
import { Cover } from './Cover.tsx';
import { FullscreenIcon, MiniPlayerIcon } from './Icons.tsx';
import { LyricsView } from './LyricsView.tsx';
import { NowPlayingActions } from './NowPlayingActions.tsx';
import { SleepTimerButton } from './SleepTimerButton.tsx';
import { ProgressBar, TransportButtons, VolumeControl } from './PlayerControls.tsx';
import { ChevronDownIcon } from './icons/ChevronDownIcon.tsx';
import { LyricsIcon } from './icons/LyricsIcon.tsx';

const t = tr.player;
const LYRICS_KEY = 'musonic.fullPlayerLyrics';

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
  const { current: song } = usePlayer();
  const lyrics = useLyrics(song);
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
          <div className="full-lyrics">
            {lyrics.status === 'loading' && <p className="full-lyrics-note">{tr.page.loading}</p>}
            {lyrics.status !== 'loading' && !lines?.line.length && <p className="full-lyrics-note">{tr.lyrics.none}</p>}
            {lines && lines.line.length > 0 && <LyricsView lyrics={lines} className="lyrics-full" />}
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
