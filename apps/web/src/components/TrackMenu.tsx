/**
 * @file TrackMenu.tsx
 * @description Actions on a track, from its "⋯" button or a right click: play
 *   next, add to queue, add to a playlist (PlaylistPicker), like, go to the album
 *   or the artist, remove from the playlist being viewed. Same actions as the
 *   mobile track sheet. Positioned in the viewport, closes on Escape or outside.
 * @author DoodzProg
 * @version 0.3.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { Song } from '@musonic/core';
import { tr } from '../i18n/index.ts';
import { usePlayer } from '../player/PlayerContext.tsx';
import { isLiked, usePlaylistActions } from '../player/usePlaylistActions.ts';
import { PlaylistPicker } from './PlaylistPicker.tsx';
import { toast } from '../lib/toast.ts';

const t = tr.trackMenu;
const MARGIN = 8;

export interface TrackMenuTarget {
  song: Song;
  /** Position of the track in the playlist being viewed (enables "remove from this playlist"). */
  playlistIndex?: number;
  playlistId?: string;
  x: number;
  y: number;
}

export function TrackMenu({ target, onClose }: { target: TrackMenuTarget; onClose: () => void }) {
  const { playNext, addToQueue } = usePlayer();
  const actions = usePlaylistActions();
  const navigate = useNavigate();
  const [picking, setPicking] = useState(false);
  const [pos, setPos] = useState({ left: target.x, top: target.y });
  const ref = useRef<HTMLDivElement>(null);
  const { song } = target;
  const liked = isLiked(song);

  // Keep the menu inside the window (flip up / left near the edges).
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const left = Math.min(target.x, window.innerWidth - box.width - MARGIN);
    const top = target.y + box.height > window.innerHeight - MARGIN ? Math.max(MARGIN, target.y - box.height) : target.y;
    setPos({ left: Math.max(MARGIN, left), top });
  }, [target.x, target.y]);

  useEffect(() => {
    if (picking) return;
    function onPointer(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose, picking]);

  const run = (action: () => void | Promise<unknown>, message?: string) => async () => {
    const result = await action();
    onClose();
    if (result === null) toast(tr.library.failed);
    else if (message) toast(message);
  };

  if (picking) return <PlaylistPicker song={song} onClose={onClose} />;

  return (
    <div className="track-menu" role="menu" aria-label={t.label(song.title)} ref={ref} style={pos}>
      <button type="button" className="menu-row" role="menuitem" onClick={run(() => playNext(song), t.willPlayNext)}>{t.playNext}</button>
      <button type="button" className="menu-row" role="menuitem" onClick={run(() => addToQueue(song), t.addedToQueue)}>{t.addToQueue}</button>
      <button type="button" className="menu-row" role="menuitem" onClick={() => setPicking(true)}>{t.addToPlaylist}…</button>
      <button type="button" className="menu-row" role="menuitem" onClick={run(() => actions.setLiked(song, !liked), liked ? t.unliked : t.liked)}>
        {liked ? t.unlike : t.like}
      </button>
      {target.playlistId !== undefined && target.playlistIndex !== undefined && (
        <button type="button" className="menu-row is-destructive" role="menuitem" onClick={run(() => actions.removeAt(target.playlistId!, target.playlistIndex!), t.removed)}>
          {t.removeFromPlaylist}
        </button>
      )}
      <div className="menu-separator" />
      {song.albumId && <button type="button" className="menu-row" role="menuitem" onClick={run(() => navigate(`/album/${song.albumId}`))}>{t.goToAlbum}</button>}
      {song.artistId && <button type="button" className="menu-row" role="menuitem" onClick={run(() => navigate(`/artist/${song.artistId}`))}>{t.goToArtist}</button>}
    </div>
  );
}
