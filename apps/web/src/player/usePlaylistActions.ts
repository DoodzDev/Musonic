/**
 * @file usePlaylistActions.ts
 * @description Edits that change the server (playlists, likes), each followed
 *   by a refresh of the cached lists it affects. Failures return null / false
 *   and are reported to the user by the caller.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import type { PlaylistWithSongs, Song } from '@musonic/core';
import { useApp } from '../context/AppContext.tsx';
import { keys } from './usePlayItem.ts';

/** Likes changed in this session, until the pages reload their songs. */
const likedOverrides = new Map<string, boolean>();

export function isLiked(song: Song): boolean {
  return likedOverrides.get(song.id) ?? !!song.starred;
}

export function usePlaylistActions() {
  const { client, cache, session } = useApp();
  const refresh = (...cacheKeys: string[]) => {
    for (const key of cacheKeys) cache.invalidate(`${session.username}|${key}`);
    window.dispatchEvent(new Event('musonic:library-changed'));
  };
  const attempt = async <T,>(run: () => Promise<T>, onDone: () => void): Promise<T | null> => {
    try {
      const result = await run();
      onDone();
      return result;
    } catch {
      return null;
    }
  };

  return {
    create: (name: string, songIds: string[] = []): Promise<PlaylistWithSongs | null> =>
      attempt(() => client.createPlaylist(name, songIds), () => refresh(keys.playlists)),
    rename: (id: string, name: string) => attempt(() => client.updatePlaylist(id, { name }), () => refresh(keys.playlists, keys.playlist(id))),
    remove: (id: string) => attempt(() => client.deletePlaylist(id), () => refresh(keys.playlists, keys.playlist(id))),
    addSongs: (id: string, songIds: string[]) =>
      attempt(() => client.updatePlaylist(id, { add: songIds }), () => refresh(keys.playlists, keys.playlist(id))),
    removeAt: (id: string, index: number) =>
      attempt(() => client.updatePlaylist(id, { removeIndexes: [index] }), () => refresh(keys.playlists, keys.playlist(id))),
    setLiked: (song: Song, liked: boolean) =>
      attempt(
        () => (liked ? client.star({ songs: [song.id] }) : client.unstar({ songs: [song.id] })),
        () => {
          likedOverrides.set(song.id, liked);
          refresh(keys.starred);
        },
      ),
  };
}
