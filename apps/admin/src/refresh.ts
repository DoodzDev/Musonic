/**
 * @file refresh.ts
 * @description Keeps a page up to date: reloads every few seconds while it is shown, and as
 *   soon as the browser tab comes back. (Real-time events for administrators come with the
 *   event bar, lot C2.)
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useEffect } from 'react';

const EVERY_MS = 10_000;

export function useAutoRefresh(load: () => void) {
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && load();
    const timer = setInterval(() => document.visibilityState === 'visible' && load(), EVERY_MS);
    addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);
}
