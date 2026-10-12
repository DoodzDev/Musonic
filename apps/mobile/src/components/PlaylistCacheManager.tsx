/**
 * @file PlaylistCacheManager.tsx
 * @description Null-render component. On mount (after server is configured),
 *   fetches the user's liked songs and all playlist membership data into
 *   playerStore and playlistCacheStore so like/playlist indicators are accurate
 *   from the first screen without per-row API calls.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {useEffect} from 'react';
import {useSettingsStore} from '../store/settingsStore';
import {usePlayerStore} from '../store/playerStore';
import {fetchAndCachePlaylistSongs} from '../store/playlistCacheStore';
import {getStarred} from '../api/endpoints/library';

export default function PlaylistCacheManager() {
  const activeServerId = useSettingsStore(s => s.activeServerId);
  const setLikedSongs = usePlayerStore(s => s.setLikedSongs);

  useEffect(() => {
    if (!activeServerId) return;
    fetchAndCachePlaylistSongs();
    getStarred()
      .then(d => setLikedSongs(d.songs.map(s => String(s.id))))
      .catch(() => {});
  }, [activeServerId, setLikedSongs]);

  return null;
}
