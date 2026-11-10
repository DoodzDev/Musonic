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

/** Calls `listener` at each position update, without re-rendering anything. */
export function subscribePosition(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The position now, seconds (read once, without following it). */
export function currentPosition(): number {
  return position;
}

let startAt: number | null = null;

/** The next track loaded starts at `seconds` (Musonic Connect: a transfer resumes there). */
export function setStartAt(seconds: number): void {
  startAt = seconds;
}

let startPaused = false;

/** The next track loaded waits, paused (the last listening, restored when the page opens). */
export function setStartPaused(): void {
  startPaused = true;
}

export function takeStartPaused(): boolean {
  const s = startPaused;
  startPaused = false;
  return s;
}

/** Read once by the player when it loads a track. */
export function takeStartAt(): number | null {
  const s = startAt;
  startAt = null;
  return s;
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
