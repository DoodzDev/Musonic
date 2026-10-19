/**
 * @file usePlaylistActions.ts
 * @description Edits that change the server (playlists, likes), each followed
 *   by a refresh of the cached lists it affects. Failures return null / false
 *   and are reported to the user by the caller. Online tracks (`ext-…`) are
 *   first imported into the library, then handled under their library id.
 * @author DoodzProg
 * @version 0.3.0
 * @license CC-BY-NC-4.0
 */

import { isExternalId, resolveLibraryId, type PlaylistWithSongs, type Song } from '@musonic/core';
import { useApp } from '../context/AppContext.tsx';
import { tr } from '../i18n/index.ts';
import { toast } from '../lib/toast.ts';
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
  /**
   * Library id of a song. An online one is imported first (up to ~1 min 30)
   * when `importIt`, else only looked up. Throws when there is none, so the
   * action fails like any other.
   */
  const libraryId = async (song: Song, importIt: boolean): Promise<string> => {
    if (!isExternalId(song.id)) return song.id;
    if (importIt) toast(tr.trackMenu.importing);
    const id = await resolveLibraryId(client, song, {
      timeoutMs: importIt ? undefined : 0,
      onSlow: () => toast(tr.trackMenu.importSlow),
    });
    if (!id) throw new Error('Not in the library');
    return id;
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
    /** Name and description (Subsonic "comment"), shared with every client. */
    update: (id: string, changes: { name: string; comment: string }) =>
      attempt(() => client.updatePlaylist(id, changes), () => refresh(keys.playlists, keys.playlist(id))),
    /** Removes every occurrence of a track from a playlist (positions read from the server). */
    removeSong: (id: string, songId: string) =>
      attempt(
        async () => {
          const playlist = await client.getPlaylist(id);
          const indexes = playlist.entry.flatMap((s, i) => (s.id === songId ? [i] : []));
          if (indexes.length) await client.updatePlaylist(id, { removeIndexes: indexes });
        },
        () => refresh(keys.playlists, keys.playlist(id)),
      ),
    remove: (id: string) => attempt(() => client.deletePlaylist(id), () => refresh(keys.playlists, keys.playlist(id))),
    addSongs: (id: string, songIds: string[]) =>
      attempt(() => client.updatePlaylist(id, { add: songIds }), () => refresh(keys.playlists, keys.playlist(id))),
    /** Adds one song, importing it first when it is an online track. */
    addSong: (id: string, song: Song) =>
      attempt(
        async () => client.updatePlaylist(id, { add: [await libraryId(song, true)] }),
        () => refresh(keys.playlists, keys.playlist(id)),
      ),
    removeAt: (id: string, index: number) =>
      attempt(() => client.updatePlaylist(id, { removeIndexes: [index] }), () => refresh(keys.playlists, keys.playlist(id))),
    setLiked: (song: Song, liked: boolean) => {
      let resolved = song.id;
      return attempt(
        async () => {
          resolved = await libraryId(song, liked);
          await (liked ? client.star({ songs: [resolved] }) : client.unstar({ songs: [resolved] }));
        },
        () => {
          likedOverrides.set(song.id, liked);
          likedOverrides.set(resolved, liked);
          refresh(keys.starred);
        },
      );
    },
  };
}
