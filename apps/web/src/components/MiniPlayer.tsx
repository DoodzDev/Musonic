/**
 * @file MiniPlayer.tsx
 * @description Content of the floating mini player window, laid out by the
 *   window size like Spotify's: one line when very low (cover, title, buttons,
 *   thin progress line), cover + title + progress with times + all buttons
 *   when normal, plus like and the next track when large, cover on top when
 *   tall, no cover when very narrow. Cover and title fade in on each new
 *   track. Keyboard shortcuts work there too. The window frame (title bar,
 *   corners) belongs to the browser; the content looks like the player bar:
 *   the blurred cover seen through tinted glass.
 * @author DoodzProg
 * @version 0.3.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { upcomingOrder } from '@musonic/core/playback';
import { useApp } from '../context/AppContext.tsx';
import { tr } from '../i18n/index.ts';
import { usePlayer } from '../player/PlayerContext.tsx';
import { usePosition } from '../player/position.ts';
import { handleShortcut, useTransport } from '../player/transport.ts';
import { isLiked, usePlaylistActions } from '../player/usePlaylistActions.ts';
import { colors } from '../theme/tokens.ts';
import { Cover } from './Cover.tsx';
import { Equalizer } from './Equalizer.tsx';
import { ProgressBar, TransportButtons } from './PlayerControls.tsx';
import { HeartIcon } from './icons/HeartIcon.tsx';

/** Progress as a thin line along the bottom edge, for the one-line layout. */
function ProgressLine() {
  const { duration } = useTransport();
  const position = usePosition();
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  return (
    <div className="mini-line" aria-hidden="true">
      <div className="mini-line-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function MiniPlayer({ win }: { win: Window }) {
  const { client } = useApp();
  const player = usePlayer();
  const transport = useTransport();
  const actions = usePlaylistActions();
  const [, setLikeRevision] = useState(0);
  const song = player.current;
  const next = upcomingOrder(player.queue)[0];
  const liked = song ? isLiked(song) : false;
  const latest = useRef({ transport, player });
  useLayoutEffect(() => {
    latest.current = { transport, player };
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => handleShortcut(event, latest.current.transport, latest.current.player);
    win.addEventListener('keydown', onKey);
    return () => win.removeEventListener('keydown', onKey);
  }, [win]);

  async function toggleLike() {
    if (!song) return;
    if ((await actions.setLiked(song, !liked)) !== null) setLikeRevision((r) => r + 1);
  }

  return (
    <div className="mini">
      {song?.coverArt && (
        <div className="mini-backdrop" aria-hidden="true">
          <img src={client.coverArtUrl(song.coverArt, 128)} alt="" />
        </div>
      )}
      <div className="mini-art">
        <Cover key={song?.entryId} coverArt={song?.coverArt} size={300} className="mini-cover mini-fade" eager />
      </div>
      <div className="mini-main">
        <div className="mini-head">
          <span key={song?.entryId} className="item-text mini-text mini-fade">
            <span className="mini-title">
              {song && <Equalizer playing={player.playing} />}
              <span className="item-title">{song ? song.title : tr.player.idle}</span>
            </span>
            {song && <span className="item-sub">{song.artist}</span>}
          </span>
          <button
            type="button"
            className="icon-btn mini-like"
            onClick={toggleLike}
            disabled={!song}
            aria-label={liked ? tr.trackMenu.unlike : tr.trackMenu.like}
            aria-pressed={liked}
            title={liked ? tr.trackMenu.unlike : tr.trackMenu.like}>
            <HeartIcon size={18} filled={liked} color={liked ? colors.accent : 'currentColor'} />
          </button>
        </div>
        <div className="mini-progress">
          <ProgressBar />
        </div>
        <TransportButtons />
        {next && (
          <p className="mini-next">
            <span className="mini-next-label">{tr.player.upNext}</span> {next.title}
            {next.artist && <span className="muted"> · {next.artist}</span>}
          </p>
        )}
      </div>
      <ProgressLine />
    </div>
  );
}
