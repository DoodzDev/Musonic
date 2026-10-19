/**
 * @file recentPlaylists.ts
 * @description When each playlist was last played on this browser, to list
 *   the most recent first in the sidebar. Subsonic servers do not keep it, so
 *   it is per browser (not shared with the mobile app). Not a secret.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useSyncExternalStore } from 'react';

const KEY = 'musonic.recentPlaylists';
const listeners = new Set<() => void>();
let snapshot: Record<string, number> = read();

function read(): Record<string, number> {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown;
    return value && typeof value === 'object' ? (value as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** `id` is scoped by the caller (user and server) so accounts do not mix. */
export function markPlaylistPlayed(id: string): void {
  snapshot = { ...snapshot, [id]: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // Order is a convenience: it then lasts until reload.
  }
  for (const listener of listeners) listener();
}

export function useRecentPlaylists(): Record<string, number> {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
  );
}
