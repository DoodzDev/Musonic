/**
 * @file TrackMenu.tsx
 * @description Actions on a track, from its "⋯" button or a right click: play
 *   next, add to queue, add to a playlist (or a new one), like, go to the album
 *   or the artist, remove from the playlist being viewed. Same actions as the
 *   mobile track sheet. Positioned in the viewport, closes on Escape or outside.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { Song } from '@musonic/core';
import { useApp } from '../context/AppContext.tsx';
import { TTL_SHORT, useCachedQuery } from '../hooks/useCachedQuery.ts';
import { fr } from '../i18n/fr.ts';
import { usePlayer } from '../player/PlayerContext.tsx';
import { keys } from '../player/usePlayItem.ts';
import { isLiked, usePlaylistActions } from '../player/usePlaylistActions.ts';
import { TextDialog } from './TextDialog.tsx';
import { toast } from '../lib/toast.ts';

const t = fr.trackMenu;
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
  const { client } = useApp();
  const { playNext, addToQueue } = usePlayer();
  const actions = usePlaylistActions();
  const navigate = useNavigate();
  const playlists = useCachedQuery(keys.playlists, TTL_SHORT, () => client.getPlaylists());
  const [picking, setPicking] = useState(false);
  const [naming, setNaming] = useState(false);
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
  }, [target.x, target.y, picking]);

  useEffect(() => {
    if (naming) return;
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
  }, [onClose, naming]);

  const run = (action: () => void | Promise<unknown>, message?: string) => async () => {
    const result = await action();
    onClose();
    if (result === null) toast(fr.library.failed);
    else if (message) toast(message);
  };

  if (naming) {
    return (
      <TextDialog
        title={fr.library.newPlaylist}
        label={fr.library.newPlaylistLabel}
        initial={fr.library.newPlaylistDefault}
        confirm={fr.common.create}
        onClose={onClose}
        onConfirm={async (name) => {
          const created = await actions.create(name, [song.id]);
          onClose();
          toast(created ? t.addedTo(name) : fr.library.failed);
        }}
      />
    );
  }

  return (
    <div className="track-menu" role="menu" aria-label={t.label(song.title)} ref={ref} style={pos}>
      {picking ? (
        <>
          <button type="button" className="menu-row menu-back" role="menuitem" onClick={() => setPicking(false)}>‹ {t.addToPlaylist}</button>
          <button type="button" className="menu-row" role="menuitem" onClick={() => setNaming(true)}>{t.newPlaylist}</button>
          {playlists.status === 'ready' &&
            playlists.data.map((p) => (
              <button key={p.id} type="button" className="menu-row" role="menuitem" onClick={run(() => actions.addSongs(p.id, [song.id]), t.addedTo(p.name))}>
                <span className="menu-ellipsis">{p.name}</span>
              </button>
            ))}
        </>
      ) : (
        <>
          <button type="button" className="menu-row" role="menuitem" onClick={run(() => playNext(song), t.willPlayNext)}>{t.playNext}</button>
          <button type="button" className="menu-row" role="menuitem" onClick={run(() => addToQueue(song), t.addedToQueue)}>{t.addToQueue}</button>
          <button type="button" className="menu-row" role="menuitem" onClick={() => setPicking(true)}>{t.addToPlaylist} ›</button>
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
        </>
      )}
    </div>
  );
}
