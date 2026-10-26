/**
 * @file playlistCacheStore.ts
 * @description Zustand + MMKV store with two layers of playlist cache:
 *   1. `savedSet` — flat set of all track IDs in any playlist (O(1) membership check
 *      for the "in playlist" indicator in SongOptionsSheet / AlbumDetail).
 *   2. `cachedPlaylists` + `cachedPlaylistSongs` — full playlist list and per-playlist
 *      song arrays used for offline mode data resilience.
 *   3. `cachedLikedSongs` — the liked songs from the last successful fetch, so the
 *      "Liked songs" screen can list the downloaded ones offline.
 *   All slices are persisted to MMKV and available synchronously after rehydration.
 * @author DoodzProg
 * @version 1.2.0
 * @license CC-BY-NC-4.0
 */
import {create} from 'zustand';
import {persist, createJSONStorage} from 'zustand/middleware';
import {mmkvStorage} from './storage';
import {getPlaylists, getPlaylist} from '../api/endpoints/playlists';
import {getStarred} from '../api/endpoints/library';
import type {SubsonicPlaylist, SubsonicSong} from '../api/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type PlaylistCacheState = {
  // ── Layer 1 : membership set ────────────────────────────────────────────────
  savedTrackIds: string[];
  savedSet: Set<string>;
  setAll: (ids: string[]) => void;
  addTracks: (ids: string[]) => void;
  removeTrack: (id: string) => void;

  // ── Layer 2 : offline data cache ────────────────────────────────────────────
  /** Full playlist list from the last successful fetch. */
  cachedPlaylists: SubsonicPlaylist[];
  /** Per-playlist song arrays keyed by playlist ID. */
  cachedPlaylistSongs: Record<string, SubsonicSong[]>;
  setCachedPlaylists: (playlists: SubsonicPlaylist[]) => void;
  setCachedPlaylistSongs: (playlistId: string, songs: SubsonicSong[]) => void;
  /** Returns cached songs for a playlist, or [] if not yet fetched. */
  getOfflineSongs: (playlistId: string) => SubsonicSong[];

  // ── Layer 3 : liked songs, for offline ──────────────────────────────────────
  cachedLikedSongs: SubsonicSong[];
  setCachedLikedSongs: (songs: SubsonicSong[]) => void;
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const usePlaylistCacheStore = create<PlaylistCacheState>()(
  persist(
    (set, get) => ({
      // ── Layer 1 ──────────────────────────────────────────────────────────────

      savedTrackIds: [],
      savedSet: new Set<string>(),

      setAll: (ids) => {
        const unique = [...new Set(ids)];
        set({savedTrackIds: unique, savedSet: new Set(unique)});
      },

      addTracks: (ids) =>
        set(s => {
          const next = [...new Set([...s.savedTrackIds, ...ids])];
          return {savedTrackIds: next, savedSet: new Set(next)};
        }),

      removeTrack: (id) =>
        set(s => {
          const next = s.savedTrackIds.filter(x => x !== id);
          return {savedTrackIds: next, savedSet: new Set(next)};
        }),

      // ── Layer 2 ──────────────────────────────────────────────────────────────

      cachedPlaylists: [],
      cachedPlaylistSongs: {},

      setCachedPlaylists: (playlists) => set({cachedPlaylists: playlists}),

      setCachedPlaylistSongs: (playlistId, songs) =>
        set(s => ({
          cachedPlaylistSongs: {...s.cachedPlaylistSongs, [playlistId]: songs},
        })),

      getOfflineSongs: (playlistId) => get().cachedPlaylistSongs[playlistId] ?? [],

      // ── Layer 3 ──────────────────────────────────────────────────────────────

      cachedLikedSongs: [],
      setCachedLikedSongs: (songs) => set({cachedLikedSongs: songs}),
    }),
    {
      name: 'musonic-playlist-cache',
      storage: createJSONStorage(() => mmkvStorage),
      // Bump on any change to the persisted shape and handle the old version in `migrate`.
      // Without `migrate`, a version mismatch discards the stored data.
      version: 2,
      // v0 (unversioned) -> v1: same shape, versioning only.
      // v1 -> v2: `cachedLikedSongs` added (defaults to [] on rehydration).
      migrate: persistedState => persistedState as PlaylistCacheState,
      partialize: (s) => ({
        savedTrackIds: s.savedTrackIds,
        cachedPlaylists: s.cachedPlaylists,
        cachedPlaylistSongs: s.cachedPlaylistSongs,
        cachedLikedSongs: s.cachedLikedSongs,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.savedSet = new Set(state.savedTrackIds);
          // Ensure objects default correctly if MMKV had no prior data.
          if (!state.cachedPlaylists) state.cachedPlaylists = [];
          if (!state.cachedPlaylistSongs) state.cachedPlaylistSongs = {};
          if (!state.cachedLikedSongs) state.cachedLikedSongs = [];
        }
      },
    },
  ),
);

// ─── Background fetch ─────────────────────────────────────────────────────────

/**
 * Fetches all playlists and their songs, then writes both caches (Layer 1 + Layer 2), and
 * the liked songs (Android Auto lists them without opening the app's screen).
 * Silent on network error — stale MMKV data remains available for offline mode.
 */
export async function fetchAndCachePlaylistSongs(): Promise<void> {
  getStarred()
    .then(d => usePlaylistCacheStore.getState().setCachedLikedSongs(d.songs))
    .catch(() => {});
  try {
    const playlists = await getPlaylists();
    if (!playlists.length) return;

    const store = usePlaylistCacheStore.getState();
    store.setCachedPlaylists(playlists);

    const results = await Promise.all(
      playlists.map(p => getPlaylist(p.id).catch(() => ({songs: [] as SubsonicSong[]}))),
    );

    // Update per-playlist cache and collect flat membership set in one pass.
    const allIds: string[] = [];
    results.forEach((r, i) => {
      const pid = playlists[i].id;
      store.setCachedPlaylistSongs(pid, r.songs);
      r.songs.forEach(s => allIds.push(String(s.id)));
    });

    store.setAll(allIds);
  } catch {
    // silent — stale MMKV data still available for offline mode
  }
}
