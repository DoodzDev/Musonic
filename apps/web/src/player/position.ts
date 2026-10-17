/**
 * @file position.ts
 * @description Playback position shared outside React state: the player bar
 *   publishes it on every time update and the lyrics follow it, without
 *   re-rendering every page that reads the queue. Seek requests go the other way.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useSyncExternalStore } from 'react';

let position = 0;
const listeners = new Set<() => void>();
const SEEK_EVENT = 'musonic:seek';

export function publishPosition(seconds: number): void {
  position = seconds;
  for (const listener of listeners) listener();
}

export function usePosition(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => position,
  );
}

/** Asks the player to jump to `seconds` (lyrics line clicked). */
export function requestSeek(seconds: number): void {
  window.dispatchEvent(new CustomEvent<number>(SEEK_EVENT, { detail: seconds }));
}

export function onSeekRequest(handler: (seconds: number) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<number>).detail);
  window.addEventListener(SEEK_EVENT, listener);
  return () => window.removeEventListener(SEEK_EVENT, listener);
}
