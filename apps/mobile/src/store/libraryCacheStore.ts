/**
 * @file libraryCacheStore.ts
 * @description The Library's albums, its artists and the size of the
 *   whole library, as last fetched from the server (R5.3). Kept on the device
 *   so the Library tabs fill at once on launch and still show offline.
 *   Playlists are cached by `playlistCacheStore`.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {create} from 'zustand';
import {persist, createJSONStorage} from 'zustand/middleware';
import {mmkvStorage} from './storage';
import type {SubsonicAlbum, SubsonicArtist} from '../api/types';

type LibraryCacheState = {
  albums: SubsonicAlbum[];
  artists: SubsonicArtist[];
  /** Albums the user starred (the others come from liked songs). */
  starredAlbumIds: string[];
  /** Artists the user starred (the others come from starred albums and liked songs). */
  starredArtistIds: string[];
  /** Tracks in the whole library (server scan count), null until known. */
  songTotal: number | null;
  save: (data: Partial<Pick<LibraryCacheState, 'albums' | 'artists' | 'starredAlbumIds' | 'starredArtistIds' | 'songTotal'>>) => void;
};

export const useLibraryCacheStore = create<LibraryCacheState>()(
  persist(
    set => ({
      albums: [],
      artists: [],
      starredAlbumIds: [],
      starredArtistIds: [],
      songTotal: null,
      save: data => set(data),
    }),
    {
      name: 'musonic-library-cache',
      storage: createJSONStorage(() => mmkvStorage),
      version: 1,
      partialize: s => ({albums: s.albums, artists: s.artists, starredAlbumIds: s.starredAlbumIds, starredArtistIds: s.starredArtistIds, songTotal: s.songTotal}),
    },
  ),
);
