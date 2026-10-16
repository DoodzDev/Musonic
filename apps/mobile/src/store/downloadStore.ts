/**
 * @file downloadStore.ts
 * @description Zustand store managing offline track downloads. Persists completed
 *   downloads to MMKV so they survive app restarts. Uses a module-level semaphore
 *   to cap concurrent network transfers at MAX_CONCURRENT (3). Only Navidrome-
 *   indexed tracks are downloadable; Deezer-sourced tracks (ext- prefix) are
 *   silently ignored because they cannot be streamed through Navidrome.
 *   "Wi-Fi only" (downloadGate): on mobile data the user confirms each
 *   request; automatic downloads (`auto`) are skipped.
 * @author DoodzProg
 * @version 1.2.0
 * @license CC-BY-NC-4.0
 */
import {create} from 'zustand';
import {persist, createJSONStorage} from 'zustand/middleware';
import {mmkvStorage} from './storage';
import RNBlobUtil from 'react-native-blob-util';
import {getRemoteCoverArtUrl, getStreamUrl} from '../api/client';
import {canDownloadAutomatically, confirmDownload} from '../services/downloadGate';
import {
  LOCAL_COVER_SIZE,
  coverKeyOf,
  deleteCoverFile,
  saveCover,
  setLocalCovers,
} from './localCovers';
import type {SubsonicSong} from '../api/types';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum number of simultaneous download tasks. Keeps the network sane. */
const MAX_CONCURRENT = 3;

/** Progress callback fire interval in ms — balances UI refresh vs JS thread load. */
const PROGRESS_INTERVAL_MS = 300;

// ─── Types ────────────────────────────────────────────────────────────────────

/** Lifecycle state of a single download task. */
export type DownloadStatus = 'queued' | 'downloading' | 'complete' | 'error';

/**
 * Metadata for a fully downloaded, locally-stored track.
 * This is the persisted shape — kept in MMKV across restarts.
 */
export type DownloadedTrack = {
  /** Navidrome track ID (matches SubsonicSong.id). */
  trackId: string;
  /** Absolute filesystem path to the saved audio file. */
  localPath: string;
  title: string;
  artist: string;
  /** Album title — may be empty for tracks without album metadata. */
  album: string;
  coverArt?: string;
  /**
   * True once the cover is saved on the device (`localCovers`, key `coverArt || trackId`).
   * Missing on tracks downloaded before covers were saved: `backfillCovers` fetches them.
   */
  coverSaved?: boolean;
  /** Track duration in seconds. */
  duration: number;
  /** File size in bytes — used for on-screen storage usage display. */
  fileSize: number;
  /** Unix timestamp (ms) when the download completed. */
  downloadedAt: number;
};

/**
 * Ephemeral in-flight download state observed by UI components.
 * Not persisted — reset to empty on cold start.
 */
export type ActiveDownload = {
  trackId: string;
  title: string;
  /** Transfer progress in the range [0, 1]. */
  progress: number;
  status: DownloadStatus;
};

// ─── Module-level concurrency primitives ─────────────────────────────────────
// Kept outside Zustand because they hold non-serialisable references and
// must not trigger component re-renders on their own.

interface PendingItem {
  trackId: string;
  track: SubsonicSong;
}

/** Ordered queue of downloads waiting for a free slot. */
const _pending: PendingItem[] = [];

/** Number of downloads currently running — must not exceed MAX_CONCURRENT. */
let _activeCount = 0;

// ─── Batch completion tracking ────────────────────────────────────────────────

interface BatchWatcher {
  pending: Set<string>;
  onComplete: () => void;
}
const _batchWatchers: BatchWatcher[] = [];

function _notifyBatch(trackId: string): void {
  for (let i = _batchWatchers.length - 1; i >= 0; i--) {
    _batchWatchers[i].pending.delete(trackId);
    if (_batchWatchers[i].pending.size === 0) {
      _batchWatchers[i].onComplete();
      _batchWatchers.splice(i, 1);
    }
  }
}

// ─── Concurrency engine ───────────────────────────────────────────────────────

/**
 * Drains the pending queue by starting as many tasks as available slots allow.
 * Called on every enqueue and on every task completion so the throughput stays
 * at MAX_CONCURRENT until the queue is empty.
 */
function _drain(): void {
  while (_activeCount < MAX_CONCURRENT && _pending.length > 0) {
    const item = _pending.shift()!;
    _activeCount++;
    _executeDownload(item.trackId, item.track).finally(() => {
      _activeCount--;
      _drain();
    });
  }
}

/**
 * Runs a single download to completion, writing the audio stream to disk.
 * Transitions the Zustand `activeDownloads` entry through:
 *   queued → downloading → (removed on success) | error
 *
 * @param trackId - Navidrome track ID; used as the local filename key.
 * @param track   - Full SubsonicSong metadata stored on successful completion.
 */
async function _executeDownload(trackId: string, track: SubsonicSong): Promise<void> {
  const store = useDownloadStore.getState;

  try {
    // Ensure the musonic downloads directory exists.
    const dir = `${RNBlobUtil.fs.dirs.DocumentDir}/musonic`;
    await RNBlobUtil.fs.mkdir(dir).catch(() => {
      // Directory already exists — not an error.
    });

    const localPath = `${dir}/${trackId}.mp3`;

    store()._setActive(trackId, track.title, 'downloading', 0);

    // Downloads keep the original file whatever the streaming quality (ADR-010 H6).
    const streamUrl = getStreamUrl(trackId, {original: true});

    // Fetch the audio stream and write it directly to `localPath`.
    const res = await RNBlobUtil
      .config({path: localPath, fileCache: false})
      .fetch('GET', streamUrl)
      .progress({interval: PROGRESS_INTERVAL_MS}, (received: number, total: number) => {
        const pct = total > 0 ? Number(received) / Number(total) : 0;
        store()._setProgress(trackId, pct);
      });

    const stat = await RNBlobUtil.fs.stat(res.path());

    // The cover goes with the track so it shows offline (ISS-034). A failure
    // here does not fail the track: `backfillCovers` retries later.
    const coverSaved = await _saveTrackCover(coverKeyOf({coverArt: track.coverArt, trackId}));

    store()._markComplete(trackId, res.path(), track, Number(stat.size), coverSaved);
    _notifyBatch(trackId);
  } catch (err) {
    // Network failure, disk full, or stream error — mark as error, do not crash.
    store()._setActive(trackId, track.title, 'error', 0);
    console.warn(`[DownloadStore] Failed to download track "${trackId}":`, err);
    _notifyBatch(trackId);
  }
}

/** Saves the cover of a downloaded track; false on any failure (offline, no cover…). */
async function _saveTrackCover(key: string): Promise<boolean> {
  try {
    return await saveCover(key, getRemoteCoverArtUrl(key, LOCAL_COVER_SIZE));
  } catch {
    return false;
  }
}

/** True while `backfillCovers` runs, so two calls never overlap. */
let _backfillRunning = false;

// ─── Store ────────────────────────────────────────────────────────────────────

type DownloadState = {
  // ── Persisted via MMKV ────────────────────────────────────────────────────

  /**
   * Map of `trackId → DownloadedTrack` for every completed offline track.
   * This is the only slice written to MMKV.
   */
  downloads: Record<string, DownloadedTrack>;

  // ── Ephemeral (reset on cold start) ───────────────────────────────────────

  /**
   * Map of `trackId → ActiveDownload` for queued and in-progress transfers.
   * Intentionally not persisted — a partial file left from a crash is ignored
   * on the next download attempt (the file is overwritten).
   */
  activeDownloads: Record<string, ActiveDownload>;

  // ── Public selectors ──────────────────────────────────────────────────────

  /**
   * Returns the absolute local file path for a completed download, or null.
   * @param trackId - Navidrome track ID.
   * @returns Absolute path string, or null if not downloaded.
   */
  getLocalPath: (trackId: string) => string | null;

  /**
   * Returns true if the track has been fully downloaded and is available offline.
   * @param trackId - Navidrome track ID.
   */
  isDownloaded: (trackId: string) => boolean;

  /**
   * Returns true if the track is currently queued or actively downloading.
   * @param trackId - Navidrome track ID.
   */
  isDownloading: (trackId: string) => boolean;

  /**
   * Returns the current download progress in [0, 1], or 0 if not active.
   * @param trackId - Navidrome track ID.
   */
  getProgress: (trackId: string) => number;

  /**
   * Returns the total disk space used by all completed downloads in bytes.
   */
  getTotalSizeBytes: () => number;

  // ── Public actions ────────────────────────────────────────────────────────

  /**
   * Adds a single track to the download queue.
   * Silently ignores: Deezer-sourced tracks (ext- prefix), already-downloaded
   * tracks, and tracks already in the active queue.
   *
   * @param track - SubsonicSong to enqueue.
   * @param options.auto - Started by the app (auto-download), not the user: never asks, skipped on mobile data when Wi-Fi only.
   */
  enqueueTrack: (track: SubsonicSong, options?: {auto?: boolean}) => void;

  /**
   * Convenience wrapper that calls `enqueueTrack` for each item in the array.
   * Tracks that fail the eligibility check are silently skipped.
   * When `onComplete` is provided, it fires once every enqueued track has
   * either succeeded or errored (regardless of individual outcomes).
   *
   * @param tracks     - Array of SubsonicSong to enqueue.
   * @param onComplete - Optional callback invoked when the full batch finishes.
   */
  enqueueBatch: (tracks: SubsonicSong[], onComplete?: () => void) => void;

  /**
   * Deletes the local audio file for a downloaded track and removes its
   * metadata from the store. Safe to call even if the file is missing on disk.
   *
   * @param trackId - Navidrome track ID to delete.
   */
  deleteDownload: (trackId: string) => Promise<void>;

  /**
   * Saves the missing covers of downloaded tracks, one at a time. Called when
   * the server becomes reachable; does nothing if a run is already going on.
   */
  backfillCovers: () => Promise<void>;

  // ── Internal setters (invoked by _executeDownload) ────────────────────────

  /** @internal Update or insert an entry in activeDownloads. */
  _setActive: (id: string, title: string, status: DownloadStatus, progress: number) => void;
  /** @internal Update progress for an existing activeDownload entry. */
  _setProgress: (id: string, progress: number) => void;
  /** @internal Move an entry from activeDownloads to downloads on success. */
  _markComplete: (id: string, path: string, track: SubsonicSong, fileSize: number, coverSaved: boolean) => void;
};

export const useDownloadStore = create<DownloadState>()(
  persist(
    (set, get) => ({
      downloads: {},
      activeDownloads: {},

      // ── Selectors ────────────────────────────────────────────────────────────

      getLocalPath: (trackId) => get().downloads[trackId]?.localPath ?? null,

      isDownloaded: (trackId) => trackId in get().downloads,

      isDownloading: (trackId) => {
        const active = get().activeDownloads[trackId];
        return active != null &&
          (active.status === 'queued' || active.status === 'downloading');
      },

      getProgress: (trackId) => get().activeDownloads[trackId]?.progress ?? 0,

      getTotalSizeBytes: () =>
        Object.values(get().downloads).reduce((acc, d) => acc + d.fileSize, 0),

      // ── Actions ──────────────────────────────────────────────────────────────

      enqueueTrack: (track, options) => {
        if (!isEligible(String(track.id))) return;
        if (options?.auto) {
          if (canDownloadAutomatically()) queueOne(track);
          return;
        }
        confirmDownload(1).then(ok => { if (ok) queueOne(track); });
      },

      enqueueBatch: (tracks, onComplete) => {
        // Only tracks that will actually be downloaded (not online, not done, not running).
        const eligible = tracks.filter(t => isEligible(String(t.id)));
        if (eligible.length === 0) { onComplete?.(); return; }
        confirmDownload(eligible.length).then(ok => {
          if (!ok) return;
          if (onComplete) _batchWatchers.push({pending: new Set(eligible.map(t => String(t.id))), onComplete});
          for (const t of eligible) { queueOne(t); }
        });
      },

      deleteDownload: async (trackId) => {
        const entry = get().downloads[trackId];
        if (!entry) return;

        try {
          const exists = await RNBlobUtil.fs.exists(entry.localPath);
          if (exists) {
            await RNBlobUtil.fs.unlink(entry.localPath);
          }
        } catch (err) {
          // Log but do not throw — the metadata removal below should still proceed.
          console.warn(`[DownloadStore] Could not unlink file for "${trackId}":`, err);
        }

        set(s => {
          const next = {...s.downloads};
          delete next[trackId];
          return {downloads: next};
        });

        // Delete the cover only when no other downloaded track still uses it.
        const key = coverKeyOf(entry);
        const stillUsed = Object.values(get().downloads).some(d => coverKeyOf(d) === key);
        if (!stillUsed) await deleteCoverFile(key);
      },

      backfillCovers: async () => {
        if (_backfillRunning) return;
        _backfillRunning = true;
        try {
          const missing = Object.values(get().downloads).filter(d => !d.coverSaved);
          for (const entry of missing) {
            if (!(await _saveTrackCover(coverKeyOf(entry)))) continue;
            set(s => {
              const current = s.downloads[entry.trackId];
              if (!current) return s;
              return {downloads: {...s.downloads, [entry.trackId]: {...current, coverSaved: true}}};
            });
          }
        } finally {
          _backfillRunning = false;
        }
      },

      // ── Internal setters ─────────────────────────────────────────────────────

      _setActive: (id, title, status, progress) => {
        set(s => ({
          activeDownloads: {
            ...s.activeDownloads,
            [id]: {trackId: id, title, status, progress},
          },
        }));
      },

      _setProgress: (id, progress) => {
        set(s => {
          const current = s.activeDownloads[id];
          if (!current) return s;
          return {
            activeDownloads: {
              ...s.activeDownloads,
              [id]: {...current, progress},
            },
          };
        });
      },

      _markComplete: (id, path, track, fileSize, coverSaved) => {
        set(s => {
          const nextActive = {...s.activeDownloads};
          delete nextActive[id];
          return {
            downloads: {
              ...s.downloads,
              [id]: {
                trackId: id,
                localPath: path,
                title: track.title,
                artist: track.artist,
                album: track.album ?? '',
                coverArt: track.coverArt,
                coverSaved,
                duration: track.duration ?? 0,
                fileSize,
                downloadedAt: Date.now(),
              },
            },
            activeDownloads: nextActive,
          };
        });
      },
    }),
    {
      name: 'musonic-downloads',
      storage: createJSONStorage(() => mmkvStorage),
      // Bump on any change to the persisted shape and handle the old version in `migrate`.
      // Without `migrate`, a version mismatch discards the stored data.
      version: 2,
      // v0 (unversioned) -> v1: same shape, versioning only.
      // v1 -> v2: optional `coverSaved` added; missing means "not saved yet",
      // `backfillCovers` fetches those covers once the server is reachable.
      migrate: persistedState => persistedState as DownloadState,
      // Only persist completed downloads. In-progress state is ephemeral —
      // partially-downloaded files are safely overwritten on the next attempt.
      partialize: (state) => ({downloads: state.downloads}),
    },
  ),
);

// ─── Local cover registry ─────────────────────────────────────────────────────
// `getCoverArtUrl` reads the registry synchronously: keep it in step with the
// downloads (hydrated synchronously from MMKV, so the first sync is complete).

function _syncLocalCovers(downloads: Record<string, DownloadedTrack>): void {
  const keys = new Set<string>();
  for (const d of Object.values(downloads)) {
    if (d.coverSaved) keys.add(coverKeyOf(d));
  }
  setLocalCovers(keys);
}

_syncLocalCovers(useDownloadStore.getState().downloads);
useDownloadStore.subscribe((state, prev) => {
  if (state.downloads !== prev.downloads) _syncLocalCovers(state.downloads);
});

/** Can be downloaded: not online (ext-), not done, not already queued or running. */
function isEligible(trackId: string): boolean {
  if (trackId.startsWith('ext-')) return false;
  const {downloads, activeDownloads} = useDownloadStore.getState();
  if (trackId in downloads) return false;
  const existing = activeDownloads[trackId];
  return !(existing && (existing.status === 'queued' || existing.status === 'downloading'));
}

/** Adds an eligible track to the queue and starts the transfers. */
function queueOne(track: SubsonicSong): void {
  const trackId = String(track.id);
  if (!isEligible(trackId)) return;
  useDownloadStore.setState(s => ({
    activeDownloads: {
      ...s.activeDownloads,
      [trackId]: {trackId, title: track.title, progress: 0, status: 'queued'},
    },
  }));
  _pending.push({trackId, track});
  _drain();
}
