/**
 * @file offlinePlaylistCovers.ts
 * @description Keeps on the device the cover of every playlist that holds a
 *   downloaded track, so the playlist header and the library show it offline.
 *   Runs when the server becomes reachable and a few seconds after the
 *   downloads change; saves what is missing and deletes what is no longer
 *   needed (no downloaded track left, or the playlist cover changed).
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {getRemoteCoverArtUrl} from '../api/client';
import {useDownloadStore} from '../store/downloadStore';
import {usePlaylistCacheStore} from '../store/playlistCacheStore';
import {storage} from '../store/storage';
import {LOCAL_COVER_SIZE, deleteCoverFile, saveCover, setLocalPlaylistCovers} from '../store/localCovers';
import {playlistCoversToKeep} from '../utils/offlineSongs';

/** MMKV key of the playlist covers saved on the device. */
const STORAGE_KEY = 'musonic-playlist-covers';
/** Wait after a download change, so a playlist download triggers one sync, not one per track. */
const DEBOUNCE_MS = 3000;

function readSaved(): string[] {
  try {
    const raw = storage.getString(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeSaved(keys: Set<string>): void {
  storage.set(STORAGE_KEY, JSON.stringify([...keys]));
  setLocalPlaylistCovers(keys);
}

let running = false;

/** Saves the missing playlist covers and drops the unneeded ones. Never throws. */
export async function syncPlaylistCovers(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const {cachedPlaylists, cachedPlaylistSongs} = usePlaylistCacheStore.getState();
    const wanted = new Set(playlistCoversToKeep(cachedPlaylists, cachedPlaylistSongs, useDownloadStore.getState().downloads));
    const saved = new Set(readSaved());
    for (const key of saved) {
      if (wanted.has(key)) continue;
      await deleteCoverFile(key);
      saved.delete(key);
    }
    for (const key of wanted) {
      if (saved.has(key)) continue;
      let url: string;
      try { url = getRemoteCoverArtUrl(key, LOCAL_COVER_SIZE); } catch { break; }
      if (await saveCover(key, url)) saved.add(key);
    }
    writeSaved(saved);
  } catch {
    // Offline or storage error: the next sync retries.
  } finally {
    running = false;
  }
}

// Covers saved earlier are served at once, before any network.
setLocalPlaylistCovers(readSaved());

let timer: ReturnType<typeof setTimeout> | null = null;
useDownloadStore.subscribe((state, prev) => {
  if (state.downloads === prev.downloads) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; syncPlaylistCovers(); }, DEBOUNCE_MS);
});
