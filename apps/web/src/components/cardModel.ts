/**
 * @file cardModel.ts
 * @description Title, subtitle (kind · artist, like the mobile app), link and React key of a card.
 * @author DoodzProg
 * @version 0.2.0
 * @license CC-BY-NC-4.0
 */

import type { CardItem } from '@musonic/core';
import { tr } from '../i18n/index.ts';

const t = tr.card;

export interface Described {
  key: string;
  title: string;
  subtitle: string;
  to: string | null;
}

export function describe(item: CardItem): Described {
  switch (item.type) {
    case 'album':
      return {
        key: `al-${item.album.id}`,
        title: item.album.name,
        subtitle: t.kindLine(item.album.songCount === 1 ? t.single : t.album, item.album.artist),
        to: `/album/${item.album.id}`,
      };
    case 'artist':
      return { key: `ar-${item.artist.id}`, title: item.artist.name, subtitle: t.artist, to: `/artist/${item.artist.id}` };
    case 'playlist':
      return { key: `pl-${item.playlist.id}`, title: item.playlist.name, subtitle: t.playlistSub(item.playlist.songCount), to: `/playlist/${item.playlist.id}` };
    case 'liked':
      return { key: 'liked', title: tr.nav.likedSongs, subtitle: t.playlistSub(item.count), to: '/liked' };
    case 'song':
      return {
        key: `so-${item.song.id}`,
        title: item.song.title,
        subtitle: t.kindLine(t.single, item.song.artist),
        to: item.song.albumId ? `/album/${item.song.albumId}` : null,
      };
    case 'mix':
      return { key: item.id, title: t.mix(item.genre), subtitle: t.mixSub, to: `/mix/${encodeURIComponent(item.genre)}` };
  }
}

