/**
 * @file onlineIdsMigration.ts
 * @description Saved Deezer items kept the OctoFiesta ids (`ext-deezer-song-…`)
 *   that Musonic Server cannot play (queue, history, caches, recent plays).
 *   Once the server is known to be Musonic Server, every saved value holding
 *   such an id is rewritten at the next launch, before any store loads it.
 *   Runs once.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {storage} from '../store/storage';
import {toMusonicOnlineIds} from './onlineIds';

/** Set by the connectivity ping when the server is Musonic Server. */
const PENDING_KEY = 'online-ids-pending';
/** Set once the saved values were rewritten. */
const DONE_KEY = 'online-ids-done';
const OLD_PREFIX = 'ext-deezer-';

/** The server is Musonic Server: the saved ids are rewritten at the next launch. */
export function markOnlineIdsPending(): void {
  if (!storage.getBoolean(DONE_KEY) && !storage.getBoolean(PENDING_KEY)) storage.set(PENDING_KEY, true);
}

/** Rewrites the saved values if the server asked for it. Never throws. */
export function convertOnlineIdsAtLaunch(): void {
  if (!storage.getBoolean(PENDING_KEY) || storage.getBoolean(DONE_KEY)) return;
  const startedAt = Date.now();
  let changed = 0;
  for (const key of storage.getAllKeys()) {
    try {
      const raw = storage.getString(key);
      if (!raw || !raw.includes(OLD_PREFIX)) continue;
      storage.set(key, toMusonicOnlineIds(raw));
      changed++;
    } catch {
      // Not a text value: nothing of ours to fix.
    }
  }
  storage.set(DONE_KEY, true);
  storage.delete(PENDING_KEY);
  console.log(`[onlineIds] ${changed} saved value(s) converted in ${Date.now() - startedAt} ms`);
}
