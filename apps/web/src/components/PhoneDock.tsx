/**
 * @file PhoneDock.tsx
 * @description Phone layout of the shell, like the Android app's Dock: a floating glass
 *   mini player (cover, titles, previous, play / pause, next, a thin progress line) above
 *   a glass capsule with the Home and Library tabs and a separate search circle. Tapping
 *   the cover or titles (never the buttons) or swiping up opens the full player; swiping
 *   left / right changes track.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useRef, type PointerEvent } from 'react';
import { NavLink } from 'react-router';
import { Icon } from '@musonic/icons';
import { tr } from '../i18n/index.ts';
import { useTransport } from '../player/transport.ts';
import { usePlayer } from '../player/PlayerContext.tsx';
import { usePosition } from '../player/position.ts';
import { Cover } from './Cover.tsx';
import { AlertIcon } from './icons/AlertIcon.tsx';
import { HomeIcon } from './icons/HomeIcon.tsx';
import { LibraryIcon } from './icons/LibraryIcon.tsx';
import { NextIcon } from './icons/NextIcon.tsx';
import { PauseIcon } from './icons/PauseIcon.tsx';
import { PlayIcon } from './icons/PlayIcon.tsx';
import { PrevIcon } from './icons/PrevIcon.tsx';
import { SearchIcon } from './icons/SearchIcon.tsx';

const t = tr.player;
/** Finger travel (px) that counts as a swipe rather than a tap. */
const SWIPE = 48;

function ProgressLine() {
  const { duration, position: remote } = useTransport();
  const local = usePosition();
  const position = remote ?? local;
  const fraction = duration > 0 ? Math.min(position / duration, 1) : 0;
  // A scale, not a width: no layout pass every second.
  return (
    <span className="dock-progress" aria-hidden="true">
      <span className="dock-progress-fill" style={{ transform: `scaleX(${fraction})` }} />
    </span>
  );
}

function DockMiniPlayer({ onExpand }: { onExpand: () => void }) {
  const player = usePlayer();
  const transport = useTransport();
  const { current: song, playing, hasNext } = player;
  const { remoteDevice, failed } = transport;
  const start = useRef<{ x: number; y: number } | null>(null);
  // A swipe ends on the buttons too: their click must not also fire.
  const swiped = useRef(false);

  if (!song) return null;

  function down(e: PointerEvent) {
    start.current = { x: e.clientX, y: e.clientY };
    swiped.current = false;
  }
  function up(e: PointerEvent) {
    const from = start.current;
    start.current = null;
    if (!from) return;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy)) {
      swiped.current = true;
      if (dx < 0) {
        if (hasNext) player.next();
      } else transport.previous();
    } else if (-dy > SWIPE && Math.abs(dy) > Math.abs(dx)) {
      swiped.current = true;
      onExpand();
    }
  }
  const act = (fn: () => void) => () => {
    if (!swiped.current) fn();
  };

  return (
    <div className="dock-mini" onPointerDown={down} onPointerUp={up} onPointerCancel={() => (start.current = null)}>
      <button type="button" className="dock-mini-info" onClick={act(onExpand)} aria-label={`${song.title}, ${song.artist ?? ''}`} title={t.expand}>
        <Cover coverArt={song.coverArt} size={44} round eager />
        <span className="item-text">
          <span className="item-title">{song.title}</span>
          {failed ? (
            <span className="player-error" role="alert"><AlertIcon size={13} triangle /> {t.error}</span>
          ) : remoteDevice ? (
            <span className="item-sub dock-device">
              <Icon name={remoteDevice.kind === 'phone' || remoteDevice.kind === 'car' ? 'phone' : 'computer'} size={13} />
              {remoteDevice.name}
            </span>
          ) : (
            <span className="item-sub">{song.artist}</span>
          )}
        </span>
      </button>
      <button type="button" className="dock-ctrl" onClick={act(transport.previous)} aria-label={t.previous}>
        <PrevIcon size={22} />
      </button>
      <button type="button" className="dock-ctrl" onClick={act(transport.togglePlay)} aria-label={playing ? t.pause : t.play}>
        {playing ? <PauseIcon size={24} color="currentColor" /> : <PlayIcon size={24} color="currentColor" />}
      </button>
      <button type="button" className="dock-ctrl" onClick={act(player.next)} disabled={!hasNext} aria-label={t.next}>
        <NextIcon size={22} />
      </button>
      <ProgressLine />
    </div>
  );
}

const tab = ({ isActive }: { isActive: boolean }) => 'dock-tab' + (isActive ? ' is-active' : '');

export function PhoneDock({ onExpand }: { onExpand: () => void }) {
  const n = tr.nav;
  return (
    <div className="phone-dock">
      <DockMiniPlayer onExpand={onExpand} />
      <nav className="dock-row" aria-label={n.main}>
        <div className="dock-tabs">
          <NavLink to="/" end className={tab}>
            {({ isActive }) => (
              <>
                <HomeIcon size={24} filled={isActive} />
                <span>{n.home}</span>
              </>
            )}
          </NavLink>
          <NavLink to="/library" className={tab}>
            {({ isActive }) => (
              <>
                <LibraryIcon size={24} filled={isActive} />
                <span>{n.library}</span>
              </>
            )}
          </NavLink>
        </div>
        <NavLink to="/search" className={({ isActive }) => 'dock-search' + (isActive ? ' is-active' : '')} aria-label={n.search}>
          {({ isActive }) => <SearchIcon size={24} filled={isActive} />}
        </NavLink>
      </nav>
    </div>
  );
}
