/**
 * @file live.ts
 * @description Notices a Musonic Server that uses short ids (ADR-026,
 *   `musonicServer` extension version 3) and converts the stores right away:
 *   downloads first (else lists with the new ids would download every song
 *   again), then the caches, likes and settings. The queue and the other saved
 *   values follow at the next launch (`boot.ts`). Old ids still work on the
 *   server meanwhile.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {SHORT_IDS_VERSION} from '@musonic/core/ids';
import {subsonicGet} from '../../api/client';
import {storage} from '../../store/storage';
import {useDownloadStore} from '../../store/downloadStore';
import {useLibraryCacheStore} from '../../store/libraryCacheStore';
import {usePlaylistCacheStore} from '../../store/playlistCacheStore';
import {useRecentPlaysStore} from '../../store/recentPlaysStore';
import {useSearchHistoryStore} from '../../store/searchHistoryStore';
import {useSettingsStore} from '../../store/settingsStore';
import {SHORT_IDS_DONE_KEY, SHORT_IDS_PENDING_KEY, renameCovers} from './boot';
import {
  convertDownloads,
  convertLibraryCache,
  convertPlaylistCache,
  convertSettings,
  shortenFields,
} from './convert';

/** True when the server answers with short ids. */
export async function serverUsesShortIds(): Promise<boolean> {
  const res = await subsonicGet<any>('getOpenSubsonicExtensions.view');
  const musonic = (res.openSubsonicExtensions ?? []).find((e: {name?: string}) => e?.name === 'musonicServer');
  return Array.isArray(musonic?.versions) && musonic.versions.includes(SHORT_IDS_VERSION);
}

/** Converts the stores in memory (and so their saved copies). */
export function convertStores(): void {
  useDownloadStore.setState(s => {
    const {downloads, covers} = convertDownloads(s.downloads);
    renameCovers(covers);
    return {downloads};
  });
  usePlaylistCacheStore.setState(s => {
    const next = convertPlaylistCache(s);
    return {...next, savedSet: new Set(next.savedTrackIds)};
  });
  useLibraryCacheStore.setState(s => convertLibraryCache(s));
  useRecentPlaysStore.setState(s => ({plays: shortenFields(s.plays)}));
  useSearchHistoryStore.setState(s => ({history: shortenFields(s.history)}));
  useSettingsStore.setState(s => convertSettings(s));
}

let checked = false;

/**
 * Once per launch, after the first answer of a Musonic Server: converts if it
 * uses short ids and that was not done yet. Never throws.
 */
export async function checkShortIds(isMusonic: boolean): Promise<void> {
  if (checked || !isMusonic || storage.getBoolean(SHORT_IDS_DONE_KEY)) return;
  checked = true;
  try {
    if (!(await serverUsesShortIds())) return;
    storage.set(SHORT_IDS_PENDING_KEY, true);
    convertStores();
    console.log('[shortIds] server uses short ids: stores converted, the rest at the next launch');
  } catch (e) {
    checked = false;
    console.log(`[shortIds] check failed (${e instanceof Error ? e.message : String(e)})`);
  }
}
