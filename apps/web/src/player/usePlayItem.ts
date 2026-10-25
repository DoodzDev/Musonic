/**
 * @file usePlayItem.ts
 * @description Starts playback of any home card: album, playlist, liked songs, artist, mix or song.
 * @author DoodzProg
 * @version 0.2.0
 * @license CC-BY-NC-4.0
 */

import type { CardItem, Song } from '@musonic/core';
import { useApp } from '../context/AppContext.tsx';
import { TTL_LONG, TTL_SHORT } from '../hooks/useCachedQuery.ts';
import { usePlayer } from './PlayerContext.tsx';

/** Cache keys shared with the pages, so opening a page after playing it is instant. */
export const keys = {
  album: (id: string) => `album:${id}`,
  playlist: (id: string) => `playlist:${id}`,
  artist: (id: string) => `artist:${id}`,
  artistInfo: (id: string) => `artistInfo:${id}`,
  topSongs: (name: string) => `topSongs:${name}`,
  starred: 'starred',
  playlists: 'playlists',
  home: (day: string) => `home:${day}`,
};

/** The songs a card stands for (an album's, a playlist's, an artist's best…), and where they come from. */
export function useItemSongs(): (item: CardItem, list?: Song[]) => Promise<{ songs: Song[]; start?: number; source: string | null }> {
  const { client, cache, session } = useApp();
  const cached = <T,>(key: string, ttl: number, load: () => Promise<T>) => cache.get(`${session.username}|${key}`, ttl, load);

  return async (item, list) => {
    switch (item.type) {
      case 'album': {
        const album = await cached(keys.album(item.album.id), TTL_LONG, () => client.getAlbum(item.album.id));
        return { songs: album.song, source: `album:${album.id}` };
      }
      case 'playlist': {
        const playlist = await cached(keys.playlist(item.playlist.id), TTL_SHORT, () => client.getPlaylist(item.playlist.id));
        return { songs: playlist.entry, source: `playlist:${playlist.id}` };
      }
      case 'liked': {
        const starred = await cached(keys.starred, TTL_SHORT, () => client.getStarred());
        return { songs: starred.song, source: 'liked' };
      }
      case 'artist': {
        const top = await cached(keys.topSongs(item.artist.name), TTL_LONG, () => client.getTopSongs(item.artist.name, 20)).catch(() => []);
        if (top.length) return { songs: top, source: `artist:${item.artist.id}` };
        // No popularity data on the server: the artist's latest album.
        const artist = await cached(keys.artist(item.artist.id), TTL_LONG, () => client.getArtist(item.artist.id));
        const latest = artist.album.slice().sort((a, b) => (b.year ?? 0) - (a.year ?? 0))[0];
        if (!latest) return { songs: [], source: null };
        const album = await cached(keys.album(latest.id), TTL_LONG, () => client.getAlbum(latest.id));
        return { songs: album.song, source: `artist:${item.artist.id}` };
      }
      case 'mix':
        return { songs: item.songs, source: item.id };
      case 'song': {
        const songs = list ?? [item.song];
        return { songs, start: Math.max(0, songs.findIndex((s) => s.id === item.song.id)), source: null };
      }
    }
  };
}

export function usePlayItem(): (item: CardItem, list?: Song[]) => Promise<void> {
  const { playSongs } = usePlayer();
  const songsOf = useItemSongs();
  return async (item, list) => {
    const { songs, start, source } = await songsOf(item, list);
    if (songs.length) playSongs(songs, start, source);
  };
}
