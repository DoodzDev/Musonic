/**
 * @file useHomeFeed.ts
 * @description Home feed of the shared engine (`@musonic/core/home`): quick
 *   access, shelves and Magic Mixes, the same as the web client, varying from
 *   one day to the next. The last feed is kept on the device (names and ids
 *   only, never a URL: URLs carry the credentials) so the home shows at once
 *   on launch and offline; it is refreshed from the server when online, and
 *   again as soon as the app is back online after a failed or offline load.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import {useCallback, useEffect, useRef, useState} from 'react';
import {loadHome, type HomeFeed} from '@musonic/core/home';
import {getActiveServer} from '../api/client';
import {homeSource} from '../services/home/homeSource';
import {storage} from '../store/storage';
import {useSettingsStore} from '../store/settingsStore';
import {useNetworkStore} from '../store/networkStore';

const STORAGE_KEY = 'musonic-home-feed';

type Saved = {account: string; feed: HomeFeed; savedAt: number};

/** The feed of the current session, shared by every mount of the home screen. */
let sessionFeed: Saved | null = null;

function accountKey(): string | null {
  const server = getActiveServer();
  return server ? `${server.url}|${server.username}` : null;
}

function readSaved(account: string): Saved | null {
  if (sessionFeed?.account === account) return sessionFeed;
  try {
    const raw = storage.getString(STORAGE_KEY);
    const saved = raw ? (JSON.parse(raw) as Saved) : null;
    return saved?.account === account ? saved : null;
  } catch {
    return null;
  }
}

function writeSaved(saved: Saved): void {
  sessionFeed = saved;
  try {
    storage.set(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Storage full or unavailable: the feed stays in memory for this session.
  }
}

export type HomeFeedState = {
  feed: HomeFeed | null;
  /** True while the first feed of the session is loading (a saved one may be shown meanwhile). */
  loading: boolean;
  /** True when the last refresh failed (offline, server down): `feed` is the saved one, if any. */
  stale: boolean;
  refresh: () => Promise<void>;
};

export function useHomeFeed(): HomeFeedState {
  const isOfflineMode = useSettingsStore(s => s.isOfflineMode);
  const serverReachable = useNetworkStore(s => s.serverReachable);
  const account = accountKey();
  const [feed, setFeed] = useState<HomeFeed | null>(() => (account ? readSaved(account)?.feed ?? null : null));
  const [loading, setLoading] = useState(false);
  const [stale, setStale] = useState(false);
  const running = useRef(false);
  // Read by the effect without re-running it on every change of `stale`.
  const staleRef = useRef(false);
  staleRef.current = stale;

  const refresh = useCallback(async () => {
    const key = accountKey();
    const server = getActiveServer();
    if (!key || !server || running.current) return;
    running.current = true;
    setLoading(true);
    try {
      const fresh = await loadHome(homeSource, {username: server.username});
      writeSaved({account: key, feed: fresh, savedAt: Date.now()});
      setFeed(fresh);
      setStale(false);
    } catch {
      setStale(true);
    } finally {
      running.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!account) return;
    setFeed(readSaved(account)?.feed ?? null);
    // Online: one fresh feed per session (pull-to-refresh asks for more). Offline: the saved one.
    if (isOfflineMode) { setStale(true); return; }
    // Back online (offline mode left, or the server answers again) after a stale feed: reload it.
    if (!serverReachable) return;
    if (sessionFeed?.account !== account || staleRef.current) refresh();
  }, [account, isOfflineMode, serverReachable, refresh]);

  return {feed, loading, stale, refresh};
}
