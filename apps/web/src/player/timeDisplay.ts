/**
 * @file timeDisplay.ts
 * @description What the right of the progress bar shows: the track's length
 *   (default) or the time left (« −8:24 »), as on the phone. Kept in this
 *   browser.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

import { useSyncExternalStore } from 'react';

const KEY = 'musonic.showRemaining';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

let value = read();

export function setShowRemaining(show: boolean): void {
  value = show;
  try {
    localStorage.setItem(KEY, show ? '1' : '0');
  } catch {
    // For this visit only.
  }
  for (const l of listeners) l();
}

export function useShowRemaining(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => value,
  );
}
