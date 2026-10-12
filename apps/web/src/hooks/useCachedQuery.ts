/**
 * @file useCachedQuery.ts
 * @description Loads data through the shared memory cache and tracks loading / error state.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext.tsx';

export const TTL_SHORT = 60_000;
export const TTL_LONG = 10 * 60_000;

export type QueryState<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

/**
 * `key` must describe the request fully (it is prefixed with the user name).
 * A `null` key skips the request.
 */
export function useCachedQuery<T>(key: string | null, ttlMs: number, load: () => Promise<T>): QueryState<T> {
  const { cache, session } = useApp();
  const fullKey = key === null ? null : `${session.username}|${key}`;
  const [state, setState] = useState<{ key: string | null; value: QueryState<T> }>({ key, value: { status: 'loading' } });
  // Data already in the cache renders on the first pass, which lets the page restore its scroll position.
  const cached = fullKey === null ? undefined : cache.peek<T>(fullKey);

  useEffect(() => {
    if (key === null) return;
    let alive = true;
    cache
      .get(`${session.username}|${key}`, ttlMs, load)
      .then((data) => alive && setState({ key, value: { status: 'ready', data } }))
      .catch(() => alive && setState({ key, value: { status: 'error' } }));
    return () => {
      alive = false;
    };
    // `load` is recreated on every render; the key identifies the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ttlMs, cache, session.username]);

  if (state.key === key && state.value.status !== 'loading') return state.value;
  if (cached !== undefined) return { status: 'ready', data: cached };
  // A new key shows "loading" right away instead of the previous page's data.
  return { status: 'loading' };
}
