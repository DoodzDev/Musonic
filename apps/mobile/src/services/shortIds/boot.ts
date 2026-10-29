/**
 * @file boot.ts
 * @description Converts what the app saved to Musonic Server's short ids
 *   (ADR-026), at launch, before any store reads its saved state: imported
 *   first by `index.js`. Runs once, after `live.ts` saw a server that uses short
 *   ids; the live pass already converted the stores that matter right away, this
 *   one also converts the queue, the caches and the saved cover keys.
 *   Imports no store (they would load their saved state first).
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import RNBlobUtil from 'react-native-blob-util';
import {storage} from '../../store/storage';
import {coverFilePath} from '../../store/localCovers';
import {
  convertCoverKey,
  convertDownloads,
  convertLibraryCache,
  convertPlaylistCache,
  convertSettings,
  shortenFields,
} from './convert';

/** Set by `live.ts` once the server announced short ids. */
export const SHORT_IDS_PENDING_KEY = 'short-ids-pending';
/** Set once everything saved was converted. */
export const SHORT_IDS_DONE_KEY = 'short-ids-done';

/** Saved stores (`{state, version}`), by MMKV key. */
const STORES: Record<string, (state: any) => any> = {
  'musonic-settings': convertSettings,
  'musonic-playlist-cache': convertPlaylistCache,
  'musonic-library-cache': convertLibraryCache,
  'musonic-recent-plays': shortenFields,
  'musonic-search-history-v2': shortenFields,
};

/** Other saved values (JSON), by MMKV key. */
const VALUES: Record<string, (value: any) => any> = {
  'playback-snapshot': v => ({...v, state: shortenFields(v.state)}),
  'playback-position': shortenFields,
  'musonic-home-feed': v => ({...v, feed: shortenFields(v.feed)}),
  'all-songs-cache-v1': shortenFields,
};

/** Asks the server for the whole library again (its copy has the old ids). */
const DROPPED = ['all-songs-etag-v1'];
/** Custom playlist covers: `coverart_pl_<playlist id>`. */
const PLAYLIST_COVER_PREFIX = 'coverart_pl_';
/** Playlist covers saved on the device (`offlinePlaylistCovers`). */
const PLAYLIST_COVERS_KEY = 'musonic-playlist-covers';

function rewrite(key: string, map: (value: any) => any): void {
  const raw = storage.getString(key);
  if (!raw) return;
  try {
    storage.set(key, JSON.stringify(map(JSON.parse(raw))));
  } catch (e) {
    // A value that does not parse is not ours to fix: left as it is.
    console.log(`[shortIds] ${key} left as it is (${String(e)})`);
  }
}

/** Renames saved cover files to their new key. Never throws. */
export async function renameCovers(pairs: [string, string][]): Promise<void> {
  for (const [from, to] of pairs) {
    const src = coverFilePath(from);
    const dest = coverFilePath(to);
    try {
      if ((await RNBlobUtil.fs.exists(src)) && !(await RNBlobUtil.fs.exists(dest))) await RNBlobUtil.fs.mv(src, dest);
    } catch {
      // The cover is fetched again when missing (`backfillCovers`).
    }
  }
}

/** Converts every saved value now (synchronous, before the stores load). */
export function convertSavedState(): void {
  const covers: [string, string][] = [];
  rewrite('musonic-downloads', v => {
    const converted = convertDownloads(v.state?.downloads);
    covers.push(...converted.covers);
    return {...v, state: {...v.state, downloads: converted.downloads}};
  });
  for (const [key, map] of Object.entries(STORES)) rewrite(key, v => ({...v, state: map(v.state ?? {})}));
  for (const [key, map] of Object.entries(VALUES)) rewrite(key, map);
  rewrite(PLAYLIST_COVERS_KEY, (keys: string[]) =>
    keys.map(k => {
      const next = convertCoverKey(k);
      if (next !== k) covers.push([k, next]);
      return next;
    }),
  );
  for (const key of DROPPED) storage.delete(key);
  for (const key of storage.getAllKeys()) {
    if (!key.startsWith(PLAYLIST_COVER_PREFIX)) continue;
    const next = PLAYLIST_COVER_PREFIX + convertCoverKey(key.slice(PLAYLIST_COVER_PREFIX.length));
    const uri = storage.getString(key);
    if (next === key || uri === undefined) continue;
    storage.set(next, uri);
    storage.delete(key);
  }
  renameCovers(covers);
}

/** At launch: converts once if a server announced short ids. */
export function convertAtLaunch(): void {
  if (!storage.getBoolean(SHORT_IDS_PENDING_KEY) || storage.getBoolean(SHORT_IDS_DONE_KEY)) return;
  const startedAt = Date.now();
  convertSavedState();
  storage.set(SHORT_IDS_DONE_KEY, true);
  storage.delete(SHORT_IDS_PENDING_KEY);
  console.log(`[shortIds] saved state converted in ${Date.now() - startedAt} ms`);
}
