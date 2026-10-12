/**
 * @file cardModel.ts
 * @description Title, subtitle, link and React key of a home card.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import type { CardItem } from '@musonic/core';
import { fr } from '../i18n/fr.ts';

const t = fr.card;

export interface Described {
  key: string;
  title: string;
  subtitle: string;
  to: string | null;
}

export function describe(item: CardItem): Described {
  switch (item.type) {
    case 'album':
      return { key: `al-${item.album.id}`, title: item.album.name, subtitle: item.album.artist ?? '', to: `/album/${item.album.id}` };
    case 'artist':
      return { key: `ar-${item.artist.id}`, title: item.artist.name, subtitle: t.artist, to: `/artist/${item.artist.id}` };
    case 'playlist':
      return { key: `pl-${item.playlist.id}`, title: item.playlist.name, subtitle: t.playlistSub(item.playlist.songCount), to: `/playlist/${item.playlist.id}` };
    case 'liked':
      return { key: 'liked', title: fr.nav.likedSongs, subtitle: t.likedSub(item.count), to: '/liked' };
    case 'song':
      return { key: `so-${item.song.id}`, title: item.song.title, subtitle: item.song.artist ?? '', to: item.song.albumId ? `/album/${item.song.albumId}` : null };
    case 'mix':
      return { key: item.id, title: t.mix(item.genre), subtitle: t.mixSub, to: null };
  }
}

