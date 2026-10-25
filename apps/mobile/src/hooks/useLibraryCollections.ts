/**
 * @file useLibraryCollections.ts
 * @description Data of the Library (R5.3): the user's playlists, the albums
 *   and artists lists and the size of the whole library. Shown at once
 *   from the copies kept on the device, then refreshed from the server (on
 *   mount, on pull to refresh, when a playlist changes and when the
 *   connection comes back). Offline, only the saved copies are used.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {useCallback, useEffect, useRef, useState} from 'react';
import {getPlaylists} from '../api/endpoints/playlists';
import {getStarred} from '../api/endpoints/library';
import {subsonicGet} from '../api/client';
import {usePlayerStore} from '../store/playerStore';
import {usePlaylistCacheStore} from '../store/playlistCacheStore';
import {useLibraryCacheStore} from '../store/libraryCacheStore';
import {useSettingsStore} from '../store/settingsStore';
import {useNetworkStore} from '../store/networkStore';
import {storage} from '../store/storage';
import {collectAlbums, collectArtists} from '../screens/Library/libraryModel';

export type LibraryStatus = 'loading' | 'ready' | 'error';

/** Songs of the last "My Music" list (saved by that screen): the real count of songs. */
export const SONG_COUNT_KEY = 'all-songs-count-v1';

/**
 * Songs in the library. The scan status counts files (a song kept in two files counts
 * twice): only until "My Music" has listed the songs once.
 */
async function fetchSongTotal(): Promise<number | null> {
  const listed = storage.getNumber(SONG_COUNT_KEY);
  if (listed) return listed;
  try {
    const res = await subsonicGet<any>('getScanStatus.view');
    const count = Number(res.scanStatus?.count);
    return Number.isFinite(count) && count > 0 ? count : null;
  } catch {
    return null;
  }
}

export function useLibraryCollections() {
  const isOfflineMode = useSettingsStore(s => s.isOfflineMode);
  const playlistVersion = usePlayerStore(s => s.playlistVersion);
  const setLikedSongs = usePlayerStore(s => s.setLikedSongs);
  const playlists = usePlaylistCacheStore(s => s.cachedPlaylists);
  const albums = useLibraryCacheStore(s => s.albums);
  const artists = useLibraryCacheStore(s => s.artists);
  const songTotal = useLibraryCacheStore(s => s.songTotal);
  const starredAlbumIds = useLibraryCacheStore(s => s.starredAlbumIds);
  const starredArtistIds = useLibraryCacheStore(s => s.starredArtistIds);

  const hasCache = playlists.length > 0 || albums.length > 0;
  const [status, setStatus] = useState<LibraryStatus>(hasCache || isOfflineMode ? 'ready' : 'loading');
  /** The last refresh failed: the lists are the saved copies. */
  const [stale, setStale] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (isOfflineMode) {
      setStatus('ready');
      setRefreshing(false);
      return;
    }
    try {
      const [pl, starred, total] = await Promise.all([
        getPlaylists(),
        getStarred().catch(() => null),
        fetchSongTotal(),
      ]);
      usePlaylistCacheStore.getState().setCachedPlaylists(pl);
      if (starred) {
        useLibraryCacheStore.getState().save({
          albums: collectAlbums(starred.albums, starred.songs),
          starredAlbumIds: starred.albums.map(a => a.id),
          artists: collectArtists(starred.artists, starred.albums, starred.songs),
          starredArtistIds: starred.artists.map(a => a.id),
        });
        setLikedSongs(starred.songs.map(s => String(s.id)));
      }
      if (total != null) useLibraryCacheStore.getState().save({songTotal: total});
      setStale(false);
      setStatus('ready');
    } catch {
      setStale(true);
      // With saved copies the Library still shows; without, it offers to retry.
      const cached = usePlaylistCacheStore.getState().cachedPlaylists.length > 0
        || useLibraryCacheStore.getState().albums.length > 0;
      setStatus(cached ? 'ready' : 'error');
    } finally {
      setRefreshing(false);
    }
  }, [isOfflineMode, setLikedSongs]);

  useEffect(() => {
    load();
  }, [load, playlistVersion]);

  // Back online after a failed load: try again.
  const isOffline = useNetworkStore(s => s.isOffline);
  const wasOffline = useRef(isOffline);
  useEffect(() => {
    const before = wasOffline.current;
    wasOffline.current = isOffline;
    if (before && !isOffline) load();
  }, [isOffline, load]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const retry = useCallback(() => {
    setStatus('loading');
    load();
  }, [load]);

  return {playlists, albums, artists, starredAlbumIds, starredArtistIds, songTotal, status, stale, refreshing, refresh, retry};
}
