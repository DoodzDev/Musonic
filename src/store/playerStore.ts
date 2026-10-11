/**
 * @file playerStore.ts
 * @description Central Zustand store for all playback UI state: queue, history,
 *   upcoming tracks, shuffle/repeat mode, liked-song overrides, playlist context,
 *   and full-screen player visibility. RNTP is the source of truth for audio;
 *   this store is the source of truth for UI. While the playback engine
 *   drives the player, queue and mode actions are handed over to it through
 *   the engine bridge (registered by the engine, so no import cycle).
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import {create} from 'zustand';
import TrackPlayer, {RepeatMode, State} from 'react-native-track-player';
import {star, unstar, getRandomSongs, getSimilarSongs} from '../api/endpoints/library';
import {SubsonicError, getStreamUrl, getCoverArtUrl, subsonicGet} from '../api/client';
import {getDeezerArtistId, getDeezerArtistTopTracks, type DeezerTrack} from '../api/deezer';
import {getT} from '../i18n';
import {useSettingsStore} from './settingsStore';
import {useDownloadStore} from './downloadStore';

export type Track = {
  id: string;
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

const REPEAT_MAP: Record<RepeatModeUI, RepeatMode> = {
  none: RepeatMode.Off,
  all: RepeatMode.Queue,
  one: RepeatMode.Track,
};

type PlayerState = {
  // Queue arrays — synced from RNTP events (used by QueueSheet)
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
  lastPlayedPlaylists: Record<string, number>;
  playlistVersion: number;
  isFetchingMagic: boolean;
  localImportedIds: Record<string, string>;

  setQueue: (tracks: Track[]) => void;
  setHistory: (history: Track[]) => void;
  setUpcoming: (upcoming: Track[]) => void;
  setOriginalQueue: (tracks: Track[]) => void;
  setMiniPlayerVisible: (visible: boolean) => void;
  onTrackChanged: () => void;
  togglePlay: () => void;
  playNext: () => void;
  playPrev: () => void;
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
  reorderQueue: (from: number, to: number) => void;
  removeFromQueue: (ids: string[]) => void;
  moveToTop: (ids: string[]) => void;
  bumpPlaylistVersion: () => void;
  setFetchingMagic: (v: boolean) => void;
  setShuffleMode: (mode: ShuffleMode) => void;
};

/** What the playback engine exposes to the store and to playerActions. */
export type EngineBridge = {
  isActive: () => boolean;
  detach: () => void;
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

/** The engine, only while it drives the player. */
export function activeEngine(): EngineBridge | null {
  return engineBridge && engineBridge.isActive() ? engineBridge : null;
}

async function addInChunks(tracks: any[], chunkSize = 15): Promise<void> {
  for (let i = 0; i < tracks.length; i += chunkSize) {
    await TrackPlayer.add(tracks.slice(i, i + chunkSize));
    if (i + chunkSize < tracks.length) {
      await new Promise<void>(r => setTimeout(r, 10));
    }
  }
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
  lastPlayedPlaylists: {},
  playlistVersion: 0,
  isFetchingMagic: false,
  localImportedIds: {} as Record<string, string>,

  setQueue: tracks => set({queue: tracks}),
  setHistory: history => set({history}),
  setUpcoming: upcoming => set({upcoming}),
  setOriginalQueue: tracks => set({originalQueue: tracks}),
  setMiniPlayerVisible: visible => set({isMiniPlayerVisible: visible}),

  onTrackChanged: () => set({isMiniPlayerVisible: true}),

  togglePlay: () => {
    TrackPlayer.getPlaybackState()
      .then(({state: s}) => {
        (s as State) === State.Playing ? TrackPlayer.pause() : TrackPlayer.play();
      })
      .catch(() => {});
  },

  playNext: () => {
    TrackPlayer.skipToNext().catch(() => {});
  },

  playPrev: () => {
    TrackPlayer.skipToPrevious().catch(() => {});
  },

  setDominantColor: color => set({dominantColor: color}),

  toggleShuffle: () => {
    const {shuffleMode, originalQueue} = get();
    const nextMode: ShuffleMode =
      shuffleMode === 'off' ? 'on' :
      shuffleMode === 'on' ? 'magic' :
      'off';
    const engine = activeEngine();
    if (engine) {
      engine.setShuffleMode(nextMode);
      return;
    }
    const newShuffled = nextMode !== 'off';
    set({shuffleMode: nextMode, isShuffled: newShuffled});
    useSettingsStore.getState().setShuffleMode(nextMode);

    const toRNTP = (t: Track) => {
      const tid = String(t.id);
      const localPath = useDownloadStore.getState().getLocalPath(tid);
      let url: string;
      if (localPath) {
        url = `file://${localPath}`;
      } else if (!tid.startsWith('ext-')) {
        url = t.url ?? (t as any).streamUrl ?? '';
      } else {
        url = (t as any).streamUrl ?? t.url ?? '';
      }
      return {
        id: tid,
        url,
        title: t.title,
        artist: t.artist,
        album: t.album,
        artwork: t.artwork ?? '',
        duration: t.duration,
        coverArt: t.coverArt,
        artistId: t.artistId,
        isMagic: t.isMagic,
        isAutoplay: t.isAutoplay,
      };
    };

    const rnTrackToTrack = (t: any): Track => ({
      id: String(t.id),
      title: String(t.title ?? ''),
      artist: String(t.artist ?? ''),
      album: String(t.album ?? ''),
      duration: Number(t.duration ?? 0),
      coverArt: t.coverArt ? String(t.coverArt) : undefined,
      url: String(t.url ?? ''),
      artwork: t.artwork ? String(t.artwork) : undefined,
      artistId: t.artistId ? String(t.artistId) : undefined,
      isMagic: t.isMagic ? true : undefined,
    });

    (async () => {
      try {
        const [activeIdx, rnQueue] = await Promise.all([
          TrackPlayer.getActiveTrackIndex(),
          TrackPlayer.getQueue(),
        ]);
        if (activeIdx == null || rnQueue.length === 0) return;

        const upcomingRN = rnQueue.slice(activeIdx + 1);
        const idxToRemove = upcomingRN.map((_, i) => activeIdx + 1 + i);

        if (nextMode === 'on') {
          const arr = upcomingRN.map(rnTrackToTrack);
          for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
          }
          if (idxToRemove.length > 0) await TrackPlayer.remove(idxToRemove);
          if (arr.length > 0) await TrackPlayer.add(arr.map(toRNTP));
          set({upcoming: arr});
        } else if (nextMode === 'magic') {
          set({isFetchingMagic: true});
          try {
          // Filter out existing magic tracks, keep only playlist tracks
          const playlistTracks = upcomingRN
            .map(rnTrackToTrack)
            .filter(t => !t.isMagic);
          const magicCount = Math.max(1, Math.floor(playlistTracks.length / 2));
          const queueIds = new Set(playlistTracks.map(t => t.id));

          // ── Genre-aware magic: Deezer top tracks for queue artists ──────────
          const artistNames = [...new Set(
            playlistTracks.slice(0, 10).map(t => t.artist).filter(Boolean),
          )].slice(0, 3);

          const [deezerArrays, navidromePool] = await Promise.all([
            Promise.all(artistNames.map(async name => {
              const id = await getDeezerArtistId(name).catch(() => null);
              if (!id) return [] as DeezerTrack[];
              return getDeezerArtistTopTracks(id, 10).catch(() => [] as DeezerTrack[]);
            })),
            // Navidrome similar songs for first native (non-Deezer) track
            (async () => {
              const firstNative = playlistTracks.find(t => !t.id.startsWith('ext-'));
              if (!firstNative) return [];
              return getSimilarSongs(firstNative.id, 10).catch(() => []);
            })(),
          ]);

          const deezerPool = [...new Map(
            deezerArrays.flat().map(t => [t.id, t]),
          ).values()];

          const deezerMagic: Track[] = deezerPool.map(t => {
            const sid = `ext-deezer-song-${t.id}`;
            return {
              id: sid, title: t.title, artist: t.artist.name, album: t.album.title,
              duration: t.duration, coverArt: sid,
              streamUrl: getStreamUrl(sid), url: getStreamUrl(sid),
              artwork: getCoverArtUrl(sid, 300), isMagic: true as const,
            };
          }).filter(t => !queueIds.has(t.id));

          const navidromeMagic: Track[] = (navidromePool as any[])
            .filter((s: any) => !queueIds.has(String(s.id)))
            .map((s: any) => ({
              id: String(s.id), title: s.title, artist: s.artist ?? '',
              album: s.album ?? '', duration: s.duration ?? 0, coverArt: s.coverArt,
              streamUrl: getStreamUrl(String(s.id)), url: getStreamUrl(String(s.id)),
              artwork: getCoverArtUrl(s.coverArt ?? String(s.id), 300),
              artistId: s.artistId ? String(s.artistId) : undefined, isMagic: true as const,
            }));

          // Shuffle pool — mix Deezer + Navidrome related tracks
          const pool: Track[] = [...deezerMagic, ...navidromeMagic];
          for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
          }

          // Fall back to random songs only if genre resolution produced nothing
          const rawMagic = pool.length > 0
            ? pool.slice(0, magicCount)
            : await getRandomSongs(magicCount).catch(() => []).then(
                (ss: any[]) => ss.map(s => ({
                  id: String(s.id), title: s.title, artist: s.artist ?? '',
                  album: s.album ?? '', duration: s.duration ?? 0, coverArt: s.coverArt,
                  streamUrl: getStreamUrl(String(s.id)), url: getStreamUrl(String(s.id)),
                  artwork: getCoverArtUrl(s.coverArt ?? String(s.id), 300), isMagic: true as const,
                })),
              );

          // Interleave: every 2 playlist tracks, insert 1 magic track
          const magicTracks = rawMagic;
          const interleaved: Track[] = [];
          let magicIdx = 0;
          for (let i = 0; i < playlistTracks.length; i++) {
            interleaved.push(playlistTracks[i]);
            if ((i + 1) % 2 === 0 && magicIdx < magicTracks.length) {
              interleaved.push(magicTracks[magicIdx++]);
            }
          }
          while (magicIdx < magicTracks.length) {
            interleaved.push(magicTracks[magicIdx++]);
          }
          if (idxToRemove.length > 0) await TrackPlayer.remove(idxToRemove);
          if (interleaved.length > 0) await addInChunks(interleaved.map(toRNTP));
          set({upcoming: interleaved});
          } finally {
            set({isFetchingMagic: false});
          }
        } else {
          // Restore original queue order, strip magic tracks
          if (!originalQueue.length) {
            if (idxToRemove.length > 0) await TrackPlayer.remove(idxToRemove);
            set({upcoming: []});
            return;
          }
          const currentId = String(rnQueue[activeIdx].id);
          const origIdx = originalQueue.findIndex(t => String(t.id) === currentId);
          const restored = (origIdx >= 0 ? originalQueue.slice(origIdx + 1) : [])
            .filter(t => !t.isMagic);
          if (idxToRemove.length > 0) await TrackPlayer.remove(idxToRemove);
          if (restored.length > 0) await TrackPlayer.add(restored.map(toRNTP));
          set({upcoming: restored});
        }
      } catch (e) {
        console.warn('[toggleShuffle] queue reorder failed', e);
      }
    })();
  },

  cycleRepeat: () => {
    const next: Record<RepeatModeUI, RepeatModeUI> = {
      none: 'all',
      all: 'one',
      one: 'none',
    };
    const newMode = next[get().repeatMode];
    set({repeatMode: newMode});
    TrackPlayer.setRepeatMode(REPEAT_MAP[newMode]).catch(() => {});
    useSettingsStore.getState().setRepeatMode(newMode);

    const engine = activeEngine();
    if (engine) {
      engine.applyRepeat(newMode);
      return;
    }

    // Immediately rebuild upcoming so queue display reflects the new repeat state
    // without waiting for the next track-change event.
    (async () => {
      try {
        const [queue, activeIdx] = await Promise.all([
          TrackPlayer.getQueue(),
          TrackPlayer.getActiveTrackIndex(),
        ]);
        if (activeIdx == null || queue.length === 0) return;
        const toT = (t: any): Track => ({
          id: String(t.id),
          title: String(t.title ?? ''),
          artist: String(t.artist ?? ''),
          album: String(t.album ?? ''),
          duration: Number(t.duration ?? 0),
          coverArt: t.coverArt ? String(t.coverArt) : undefined,
          url: String(t.url ?? ''),
          artwork: t.artwork ? String(t.artwork) : undefined,
          isMagic: (t as any).isMagic ? true : undefined,
          isAutoplay: (t as any).isAutoplay ? true : undefined,
        });
        const after = queue.slice(activeIdx + 1).map(toT);
        if (newMode === 'all') {
          set({upcoming: [...after, ...queue.slice(0, activeIdx).map(toT)]});
        } else {
          set({upcoming: after});
        }
      } catch {}
    })();
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

  reorderQueue: (from, to) => {
    const engine = activeEngine();
    if (engine) {
      const list = get().upcoming;
      const moved = list[from];
      const rest = list.filter((_, i) => i !== from);
      if (moved) engine.move(moved.id, rest[to]?.id ?? null);
      return;
    }
    const arr = [...get().upcoming];
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    set({upcoming: arr});
    TrackPlayer.getActiveTrackIndex()
      .then(activeIdx => {
        if (activeIdx == null) return;
        return TrackPlayer.move(activeIdx + 1 + from, activeIdx + 1 + to);
      })
      .catch(() => {});
  },

  removeFromQueue: ids => {
    const engine = activeEngine();
    if (engine) {
      engine.remove(ids);
      return;
    }
    set(s => ({upcoming: s.upcoming.filter(t => !ids.includes(t.id))}));
    TrackPlayer.getQueue()
      .then(queue => {
        const indices = queue
          .map((t, i) => ({id: String(t.id), i}))
          .filter(({id}) => ids.includes(id))
          .map(({i}) => i);
        if (indices.length > 0) return TrackPlayer.remove(indices);
      })
      .catch(() => {});
  },

  moveToTop: ids => {
    const engine = activeEngine();
    if (engine) {
      const picked = ids.map(id => get().upcoming.find(t => t.id === id)).filter(Boolean) as Track[];
      engine.remove(ids).then(() => engine.playNext(picked));
      return;
    }
    const {upcoming} = get();
    const selected = ids
      .map(id => upcoming.find(t => t.id === id))
      .filter(Boolean) as Track[];
    const rest = upcoming.filter(t => !ids.includes(t.id));
    set({upcoming: [...selected, ...rest]});
    TrackPlayer.getActiveTrackIndex()
      .then(async activeIdx => {
        if (activeIdx == null) return;
        for (let i = 0; i < ids.length; i++) {
          const queue = await TrackPlayer.getQueue();
          const srcIdx = queue.findIndex(t => String(t.id) === ids[i]);
          if (srcIdx !== -1) await TrackPlayer.move(srcIdx, activeIdx + 1 + i);
        }
      })
      .catch(() => {});
  },

  bumpPlaylistVersion: () => set(s => ({playlistVersion: s.playlistVersion + 1})),
  setFetchingMagic: v => set({isFetchingMagic: v}),
  setShuffleMode: mode => {
    set({shuffleMode: mode, isShuffled: mode !== 'off'});
    useSettingsStore.getState().setShuffleMode(mode);
  },
}));
