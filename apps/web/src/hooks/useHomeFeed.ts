/**
 * @file useHomeFeed.ts
 * @description The day's home feed (shelves, Magic Mixes), shared by the Home,
 *   the search proposals and the mix pages through the same cache key.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useState } from 'react';
import { loadHome, type HomeFeed } from '@musonic/core';
import { useApp } from '../context/AppContext.tsx';
import { keys } from '../player/usePlayItem.ts';
import { TTL_LONG, useCachedQuery, type QueryState } from './useCachedQuery.ts';

/** More mixes than the mobile app: the desktop has room for them. */
const MIX_COUNT = 8;

export function useHomeFeed(): QueryState<HomeFeed> {
  const { client, session } = useApp();
  // Read the clock once per visit: the feed is keyed by day.
  const [today] = useState(() => new Date());
  return useCachedQuery(keys.home(today.toDateString()), TTL_LONG, () =>
    loadHome(client, { username: session.username, now: today, mixCount: MIX_COUNT }),
  );
}
