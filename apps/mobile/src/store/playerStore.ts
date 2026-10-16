/**
 * @file playerStore.ts
 * @description Central Zustand store for all playback UI state: queue, history,
 *   upcoming tracks, shuffle/repeat mode, liked-song overrides, playlist context,
 *   and full-screen player visibility. RNTP is the source of truth for audio;
 *   this store is the source of truth for UI. The queue is published here by
 *   the playback engine; queue and mode actions are handed over to it through
 *   the engine bridge (registered by the engine, so no import cycle).
 * @author DoodzProg
 * @version 2.2.0
 * @license CC-BY-NC-4.0
 */
import {create} from 'zustand';
import TrackPlayer, {State} from 'react-native-track-player';
import {star, unstar} from '../api/endpoints/library';
import {SubsonicError, getStreamUrl, subsonicGet} from '../api/client';
import {getT} from '../i18n';
import {useSettingsStore} from './settingsStore';
import {haptic} from '../services/haptics';

export type Track = {
  id: string;
  /** Unique per queue entry, set by the playback engine (same track twice = two entries). */
  entryId?: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  coverArt?: string;
  streamUrl?: string;
  artistId?: string;
  url?: string;
  artwork?: string;
  isMagic?: boolean;
  isAutoplay?: boolean;
};

export type ShuffleMode = 'off' | 'on' | 'magic';

export type RepeatModeUI = 'none' | 'all' | 'one';

type PlayerState = {
  // Queue arrays — published by the playback engine (used by QueueSheet)
  queue: Track[];
  history: Track[];
  upcoming: Track[];
  originalQueue: Track[];
  // UI-only state not tracked by RNTP
  isMiniPlayerVisible: boolean;
  dominantColor: string;
  isShuffled: boolean;
  shuffleMode: ShuffleMode;
  repeatMode: RepeatModeUI;
  isFullScreenOpen: boolean;
  likedSongIds: Set<string>;
  localLikeOverrides: Record<string, boolean>;
  playlistSongIds: Set<string>;
  currentPlaylistId: string | null;
  currentPlaylistName: string | null;
  /** List the playback was started from (`type:id`), for the pages' Play / Pause button. */
  currentSourceKey: string | null;
  lastPlayedPlaylists: Record<string, number>;
  playlistVersion: number;
  isFetchingMagic: boolean;
  localImportedIds: Record<string, string>;

  setMiniPlayerVisible: (visible: boolean) => void;
  onTrackChanged: () => void;
  togglePlay: () => void;
  setDominantColor: (color: string) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  openFullScreen: () => void;
  closeFullScreen: () => void;
  pendingLikeRetries: Set<string>;
  pendingLikeToast: string | null;
  pendingLikes: Set<string>;
  addPendingLikeRetry: (id: string) => void;
  removePendingLikeRetry: (id: string) => void;
  revertLikeOverride: (id: string) => void;
  setPendingLikeToast: (msg: string | null) => void;
  addPendingLike: (id: string) => void;
  removePendingLike: (id: string) => void;
  toggleLike: (trackId: string, trackTitle?: string, trackArtist?: string) => Promise<boolean>;
  setLikedSongs: (ids: string[]) => void;
  setPlaylistSong: (id: string, inPlaylist: boolean) => void;
  setCurrentPlaylist: (id: string | null, name: string | null) => void;
  setCurrentSourceKey: (key: string | null) => void;
  /** Moves a track before `beforeId` (null = the very end); resolves once applied. */
  reorderQueue: (id: string, beforeId: string | null) => Promise<void>;
  removeFromQueue: (ids: string[]) => void;
  moveToTop: (ids: string[]) => void;
  bumpPlaylistVersion: () => void;
  setFetchingMagic: (v: boolean) => void;
  setShuffleMode: (mode: ShuffleMode) => void;
};

/** What the playback engine exposes to the store and to playerActions. */
export type EngineBridge = {
  setShuffleMode: (mode: ShuffleMode) => Promise<void>;
  applyRepeat: (mode: RepeatModeUI) => Promise<void>;
  next: () => Promise<void>;
  previous: (always?: boolean) => Promise<void>;
  playNext: (tracks: Track[]) => Promise<void>;
  remove: (ids: string[]) => Promise<void>;
  move: (id: string, beforeId: string | null) => Promise<void>;
};

let engineBridge: EngineBridge | null = null;

export function setEngineBridge(bridge: EngineBridge): void {
  engineBridge = bridge;
}

/** The engine, registered once its module is loaded. */
export function playbackBridge(): EngineBridge | null {
  return engineBridge;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  queue: [],
  originalQueue: [],
  history: [],
  upcoming: [],
  isMiniPlayerVisible: false,
  dominantColor: '#3D1F0F',
  isShuffled: false,
  shuffleMode: 'off' as ShuffleMode,
  repeatMode: 'none',
  isFullScreenOpen: false,
  likedSongIds: new Set<string>(),
  localLikeOverrides: {} as Record<string, boolean>,
  pendingLikeRetries: new Set<string>(),
  pendingLikeToast: null,
  pendingLikes: new Set<string>(),
  playlistSongIds: new Set<string>(),
  currentPlaylistId: null,
  currentPlaylistName: null,
  currentSourceKey: null,
  lastPlayedPlaylists: {},
  playlistVersion: 0,
  isFetchingMagic: false,
  localImportedIds: {} as Record<string, string>,

  setMiniPlayerVisible: visible => set({isMiniPlayerVisible: visible}),

  onTrackChanged: () => set({isMiniPlayerVisible: true}),

  togglePlay: () => {
    TrackPlayer.getPlaybackState()
      .then(({state: s}) => {
        (s as State) === State.Playing ? TrackPlayer.pause() : TrackPlayer.play();
      })
      .catch(() => {});
  },

  setDominantColor: color => set({dominantColor: color}),

  // Haptics live in the actions themselves (R4.6): every screen's button gets the same feedback.
  toggleShuffle: () => {
    haptic('selection');
    const {shuffleMode} = get();
    const nextMode: ShuffleMode =
      shuffleMode === 'off' ? 'on' :
      shuffleMode === 'on' ? 'magic' :
      'off';
    const engine = playbackBridge();
    if (engine) engine.setShuffleMode(nextMode);
    else get().setShuffleMode(nextMode);
  },

  cycleRepeat: () => {
    haptic('selection');
    const next: Record<RepeatModeUI, RepeatModeUI> = {
      none: 'all',
      all: 'one',
      one: 'none',
    };
    const newMode = next[get().repeatMode];
    set({repeatMode: newMode});
    useSettingsStore.getState().setRepeatMode(newMode);
    playbackBridge()?.applyRepeat(newMode);
  },

  openFullScreen: () => set({isFullScreenOpen: true}),
  closeFullScreen: () => set({isFullScreenOpen: false}),

  addPendingLikeRetry: id =>
    set(s => ({pendingLikeRetries: new Set([...s.pendingLikeRetries, id])})),

  removePendingLikeRetry: id =>
    set(s => {
      const next = new Set(s.pendingLikeRetries);
      next.delete(id);
      return {pendingLikeRetries: next};
    }),

  revertLikeOverride: id =>
    set(s => {
      const next = {...s.localLikeOverrides};
      delete next[id];
      return {localLikeOverrides: next};
    }),

  setPendingLikeToast: msg => set({pendingLikeToast: msg}),

  addPendingLike: id =>
    set(s => ({pendingLikes: new Set([...s.pendingLikes, id])})),

  removePendingLike: id =>
    set(s => {
      const next = new Set(s.pendingLikes);
      next.delete(id);
      return {pendingLikes: next};
    }),

  toggleLike: async (trackId: string, trackTitle?: string, trackArtist?: string): Promise<boolean> => {
    haptic('success');
    const t = getT().likes;

    if (trackId.startsWith('ext-')) {
      const {likedSongIds: lids, localLikeOverrides: overrides} = get();
      const currentLiked = overrides[trackId] ?? lids.has(trackId);

      if (currentLiked) {
        // Unstar via navidromeId (cached or freshly looked up via search3)
        set(s => ({pendingLikes: new Set([...s.pendingLikes, trackId])}));
        try {
          let navidromeId: string | undefined = get().localImportedIds[trackId];
          if (!navidromeId) {
            const res = await subsonicGet<any>('search3.view', {
              query: trackTitle ?? '',
              songCount: 10,
              albumCount: 0,
              artistCount: 0,
            });
            const songs: any[] = res.searchResult3?.song ?? [];
            const match = songs.find(s => {
              const id = String(s.id);
              return !id.startsWith('ext-') && s.title === trackTitle && (!trackArtist || s.artist === trackArtist);
            });
            if (match) navidromeId = String(match.id);
          }
          if (navidromeId) await unstar(navidromeId);
        } catch { /* best effort */ }
        set(s => {
          const next = new Set(s.pendingLikes);
          next.delete(trackId);
          const nextOverrides = {...s.localLikeOverrides};
          delete nextOverrides[trackId];
          return {pendingLikes: next, localLikeOverrides: nextOverrides, pendingLikeToast: t.removedFromLiked};
        });
        return true;
      }

      // Fast path: track was previously imported this session — skip full poll cycle
      const cachedNavidromeId = get().localImportedIds[trackId];
      if (cachedNavidromeId) {
        set(s => ({
          pendingLikes: new Set([...s.pendingLikes, trackId]),
          localLikeOverrides: {...s.localLikeOverrides, [trackId]: true},
        }));
        try {
          await star(cachedNavidromeId);
          set(s => {
            const next = new Set(s.pendingLikes);
            next.delete(trackId);
            return {pendingLikes: next, pendingLikeToast: t.addedToLikedNamed(trackTitle ?? '')};
          });
          return true;
        } catch {
          // Stale cache — evict and fall through to full import
          set(s => {
            const next = new Set(s.pendingLikes);
            next.delete(trackId);
            const nextImported = {...s.localImportedIds};
            delete nextImported[trackId];
            return {pendingLikes: next, localImportedIds: nextImported};
          });
        }
      }

      set(s => ({
        localLikeOverrides: {...s.localLikeOverrides, [trackId]: true},
        pendingLikes: new Set([...s.pendingLikes, trackId]),
        pendingLikeToast: t.sendingToServer,
      }));

      // Keep connection alive so OctoFiesta downloads the full track before responding
      fetch(getStreamUrl(trackId), {headers: {Range: 'bytes=0-8192'}})
        .then(res => res.arrayBuffer())
        .catch(() => {});

      // Poll search3.view every 3s for up to 75s (covers download + 30s Navidrome scan debounce)
      let navidromeId: string | null = null;
      for (let attempt = 0; attempt < 25; attempt++) {
        await new Promise<void>(r => setTimeout(r, 3000));
        if (attempt === 10) {
          set({pendingLikeToast: t.stillImporting});
        }
        try {
          const res = await subsonicGet<any>('search3.view', {
            query: trackTitle ?? '',
            songCount: 10,
            albumCount: 0,
            artistCount: 0,
          });
          const songs: any[] = res.searchResult3?.song ?? [];
          const match = songs.find(s => {
            const id = String(s.id);
            const titleMatch = s.title === trackTitle;
            const artistMatch = !trackArtist || s.artist === trackArtist;
            return !id.startsWith('ext-') && titleMatch && artistMatch;
          });
          if (match) { navidromeId = String(match.id); break; }
        } catch { /* keep polling */ }
      }

      // Remove from spinner set regardless of outcome
      set(s => {
        const next = new Set(s.pendingLikes);
        next.delete(trackId);
        return {pendingLikes: next};
      });

      if (navidromeId) {
        const nid = navidromeId;
        set(s => ({localImportedIds: {...s.localImportedIds, [trackId]: nid}}));
        try {
          await star(nid);
          set({pendingLikeToast: t.addedToLikedNamed(trackTitle ?? '')});
          return true;
        } catch { /* star with native ID failed */ }
      }

      set(s => {
        const next = {...s.localLikeOverrides};
        delete next[trackId];
        return {localLikeOverrides: next, pendingLikeToast: t.sendError};
      });
      return false;
    }

    // Navidrome track flow
    const {likedSongIds, localLikeOverrides} = get();
    const currentLiked = localLikeOverrides[trackId] ?? likedSongIds.has(trackId);
    const newLiked = !currentLiked;
    set({localLikeOverrides: {...localLikeOverrides, [trackId]: newLiked}});
    try {
      await (newLiked ? star : unstar)(trackId);
      return true;
    } catch (err: unknown) {
      if (err instanceof SubsonicError && err.isPermanent) {
        set(s => {
          const next = {...s.localLikeOverrides};
          delete next[trackId];
          return {localLikeOverrides: next, pendingLikeToast: t.unavailableTrack};
        });
      } else {
        // Transient error — keep optimistic override, retry when track plays
        set(s => ({pendingLikeRetries: new Set([...s.pendingLikeRetries, trackId])}));
      }
      return false;
    }
  },

  setLikedSongs: (ids: string[]) => set({likedSongIds: new Set(ids)}),

  setPlaylistSong: (id: string, inPlaylist: boolean) =>
    set(s => {
      const next = new Set(s.playlistSongIds);
      if (inPlaylist) next.add(id);
      else next.delete(id);
      return {playlistSongIds: next};
    }),

  setCurrentSourceKey: key => set({currentSourceKey: key}),

  setCurrentPlaylist: (id, name) => {
    if (id != null) {
      useSettingsStore.getState().setLastPlayedPlaylist(id, Date.now());
    }
    set(s => ({
      currentPlaylistId: id,
      currentPlaylistName: name,
      lastPlayedPlaylists:
        id != null
          ? {...s.lastPlayedPlaylists, [id]: Date.now()}
          : s.lastPlayedPlaylists,
    }));
  },

  reorderQueue: (id, beforeId) => playbackBridge()?.move(id, beforeId) ?? Promise.resolve(),

  removeFromQueue: ids => {
    playbackBridge()?.remove(ids);
  },

  moveToTop: ids => {
    const engine = playbackBridge();
    if (!engine) return;
    const picked = ids.map(id => get().upcoming.find(t => (t.entryId ?? t.id) === id)).filter(Boolean) as Track[];
    engine.remove(ids).then(() => engine.playNext(picked));
  },

  bumpPlaylistVersion: () => set(s => ({playlistVersion: s.playlistVersion + 1})),
  setFetchingMagic: v => set({isFetchingMagic: v}),
  setShuffleMode: mode => {
    set({shuffleMode: mode, isShuffled: mode !== 'off'});
    useSettingsStore.getState().setShuffleMode(mode);
  },
}));
