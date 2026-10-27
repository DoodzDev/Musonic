/**
 * @file sleepTimer.ts
 * @description Sleep timer, as in the mobile app: playback pauses after a
 *   chosen time (any hours / minutes / seconds), or at the end of the current
 *   track. The audio engine gives the pause (`registerSleepPause`) and asks at
 *   each track end (`takeEndOfTrack`). Not saved: reloading the page cancels it.
 *   In a tab hidden for a while, the browser may fire it up to a minute late.
 * @author DoodzProg
 * @version 0.1.1
 * @license CC-BY-NC-4.0
 */

import { useSyncExternalStore } from 'react';

export interface SleepTimerState {
  /** When playback pauses (ms since epoch), or null. */
  endsAt: number | null;
  /** Pause when the current track ends. */
  endOfTrack: boolean;
}

let state: SleepTimerState = { endsAt: null, endOfTrack: false };
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let pause: (() => void) | null = null;

function set(next: SleepTimerState) {
  state = next;
  for (const listener of listeners) listener();
}

/** Pauses after `seconds`, at the end of the current track (`'track'`), or cancels (`null`). */
export function setSleepTimer(choice: number | 'track' | null): void {
  if (timer) clearTimeout(timer);
  timer = null;
  if (choice === null) return set({ endsAt: null, endOfTrack: false });
  if (choice === 'track') return set({ endsAt: null, endOfTrack: true });
  const ms = Math.max(1, Math.round(choice)) * 1000;
  set({ endsAt: Date.now() + ms, endOfTrack: false });
  timer = setTimeout(() => {
    timer = null;
    set({ endsAt: null, endOfTrack: false });
    pause?.();
  }, ms);
}

/** The audio engine's pause; returns the unregistering function. */
export function registerSleepPause(fn: () => void): () => void {
  pause = fn;
  return () => {
    if (pause === fn) pause = null;
  };
}

/** "End of track" is set (without taking it): the engine then lets the track end without a crossfade. */
export function isEndOfTrackSet(): boolean {
  return state.endOfTrack;
}

/** True once when a track ends with "end of track" set: the engine then holds the next one. */
export function takeEndOfTrack(): boolean {
  if (!state.endOfTrack) return false;
  set({ endsAt: null, endOfTrack: false });
  return true;
}

/** Whole seconds left, rounded up (at least 1). */
export function secondsLeft(endsAt: number, now = Date.now()): number {
  return Math.max(1, Math.ceil((endsAt - now) / 1000));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSleepTimer(): SleepTimerState {
  return useSyncExternalStore(subscribe, () => state);
}
