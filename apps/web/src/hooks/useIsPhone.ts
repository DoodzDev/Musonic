/**
 * @file useIsPhone.ts
 * @description True on a narrow screen (a phone held upright): the shell then swaps
 *   the sidebar and the player bar for the phone Dock. Same breakpoint as the CSS.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useSyncExternalStore } from 'react';

export const PHONE_QUERY = '(max-width: 760px)';

const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(PHONE_QUERY) : null;

function subscribe(listener: () => void): () => void {
  media?.addEventListener('change', listener);
  return () => media?.removeEventListener('change', listener);
}

export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, () => media?.matches ?? false);
}
