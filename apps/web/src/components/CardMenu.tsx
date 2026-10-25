/**
 * @file CardMenu.tsx
 * @description Right-click menu of a card (album, artist, playlist, mix, liked
 *   songs): play, play next, add to the queue, open, go to the artist. A song
 *   card gets the track menu instead.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import type { CardItem, Song } from '@musonic/core';
import { useState, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { tr } from '../i18n/index.ts';
import { toast } from '../lib/toast.ts';
import { claimContextMenu } from '../player/contextMenu.ts';
import { usePlayer } from '../player/PlayerContext.tsx';
import { useItemSongs, usePlayItem } from '../player/usePlayItem.ts';
import { describe } from './cardModel.ts';
import { MenuRow, MenuShell } from './MenuShell.tsx';
import { TrackMenu } from './TrackMenu.tsx';

export interface CardMenuTarget {
  item: CardItem;
  list?: Song[];
  x: number;
  y: number;
}

export function CardMenu({ target, onClose }: { target: CardMenuTarget; onClose: () => void }) {
  const t = tr.contextMenu;
  const { item, list } = target;
  const navigate = useNavigate();
  const { playNext, addToQueue } = usePlayer();
  const play = usePlayItem();
  const songsOf = useItemSongs();
  const d = describe(item);

  const withSongs = (action: (songs: Song[]) => void, message: (n: number) => string) => async () => {
    onClose();
    try {
      const { songs } = await songsOf(item, list);
      if (!songs.length) return;
      action(songs);
      toast(message(songs.length));
    } catch {
      toast(tr.library.failed);
    }
  };
  const artistId = item.type === 'album' ? item.album.artistId : undefined;

  return (
    <MenuShell x={target.x} y={target.y} label={t.cardLabel(d.title)} onClose={onClose}>
      <MenuRow onClick={() => { onClose(); void play(item, list); }}>{t.play}</MenuRow>
      <MenuRow onClick={withSongs((songs) => songs.slice().reverse().forEach(playNext), t.willPlayNext)}>{tr.trackMenu.playNext}</MenuRow>
      <MenuRow onClick={withSongs((songs) => songs.forEach(addToQueue), t.added)}>{tr.trackMenu.addToQueue}</MenuRow>
      {(d.to || artistId) && <div className="menu-separator" />}
      {d.to && <MenuRow onClick={() => { onClose(); navigate(d.to!); }}>{t.open}</MenuRow>}
      {artistId && <MenuRow onClick={() => { onClose(); navigate(`/artist/${artistId}`); }}>{tr.trackMenu.goToArtist}</MenuRow>}
    </MenuShell>
  );
}

/** Right click on a card or a tile: its menu (the track menu for a song). */
export function useCardMenu(item: CardItem, list?: Song[]): { onContextMenu: (e: MouseEvent) => void; menu: ReactNode } {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const onContextMenu = (e: MouseEvent) => {
    if (claimContextMenu(e)) setAt({ x: e.clientX, y: e.clientY });
  };
  const close = () => setAt(null);
  // In the page body: a card's hover effects must not move a fixed menu.
  const menu = !at
    ? null
    : createPortal(
        item.type === 'song' ? (
          <TrackMenu target={{ song: item.song, x: at.x, y: at.y }} onClose={close} />
        ) : (
          <CardMenu target={{ item, list, x: at.x, y: at.y }} onClose={close} />
        ),
        document.body,
      );
  return { onContextMenu, menu };
}
