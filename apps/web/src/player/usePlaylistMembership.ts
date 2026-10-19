/**
 * @file usePlaylistMembership.ts
 * @description Which of the user's playlists hold each track, for the
 *   "+" / "✓" button of the track rows (like the mobile app). Reads every
 *   playlist through the shared cache; any playlist edit invalidates it
 *   (its key starts with the playlists key).
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useApp } from '../context/AppContext.tsx';
import { TTL_SHORT, useCachedQuery } from '../hooks/useCachedQuery.ts';
import { keys } from './usePlayItem.ts';

/** Track id → ids of the playlists holding it. */
export type Membership = Map<string, Set<string>>;

export function usePlaylistMembership(): Membership | null {
  const { client, cache, session } = useApp();
  const state = useCachedQuery(`${keys.playlists}-membership`, TTL_SHORT, async () => {
    const playlists = await cache.get(`${session.username}|${keys.playlists}`, TTL_SHORT, () => client.getPlaylists());
    const full = await Promise.all(
      playlists.map((p) => cache.get(`${session.username}|${keys.playlist(p.id)}`, TTL_SHORT, () => client.getPlaylist(p.id)).catch(() => null)),
    );
    const map: Membership = new Map();
    for (const playlist of full) {
      if (!playlist) continue;
      for (const song of playlist.entry) {
        const set = map.get(song.id) ?? new Set<string>();
        set.add(playlist.id);
        map.set(song.id, set);
      }
    }
    return map;
  });
  return state.status === 'ready' ? state.data : null;
}
