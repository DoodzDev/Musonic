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

export function usePlayItem(): (item: CardItem, list?: Song[]) => Promise<void> {
  const { client, cache, session } = useApp();
  const { playSongs } = usePlayer();
  const cached = <T,>(key: string, ttl: number, load: () => Promise<T>) => cache.get(`${session.username}|${key}`, ttl, load);

  return async (item, list) => {
    switch (item.type) {
      case 'album': {
        const album = await cached(keys.album(item.album.id), TTL_LONG, () => client.getAlbum(item.album.id));
        playSongs(album.song, undefined, `album:${album.id}`);
        return;
      }
      case 'playlist': {
        const playlist = await cached(keys.playlist(item.playlist.id), TTL_SHORT, () => client.getPlaylist(item.playlist.id));
        playSongs(playlist.entry, undefined, `playlist:${playlist.id}`);
        return;
      }
      case 'liked': {
        const starred = await cached(keys.starred, TTL_SHORT, () => client.getStarred());
        playSongs(starred.song, undefined, 'liked');
        return;
      }
      case 'artist': {
        const top = await cached(keys.topSongs(item.artist.name), TTL_LONG, () => client.getTopSongs(item.artist.name, 20)).catch(() => []);
        if (top.length) {
          playSongs(top, undefined, `artist:${item.artist.id}`);
          return;
        }
        // No popularity data on the server: play the artist's latest album.
        const artist = await cached(keys.artist(item.artist.id), TTL_LONG, () => client.getArtist(item.artist.id));
        const latest = artist.album.slice().sort((a, b) => (b.year ?? 0) - (a.year ?? 0))[0];
        if (!latest) return;
        const album = await cached(keys.album(latest.id), TTL_LONG, () => client.getAlbum(latest.id));
        playSongs(album.song, undefined, `artist:${item.artist.id}`);
        return;
      }
      case 'mix':
        playSongs(item.songs, undefined, item.id);
        return;
      case 'song': {
        const songs = list ?? [item.song];
        playSongs(songs, Math.max(0, songs.findIndex((s) => s.id === item.song.id)), null);
        return;
      }
    }
  };
}
