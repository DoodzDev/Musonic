/**
 * @file crossfade.ts
 * @description Crossfade setting of the web player (0 = off, up to 12 s),
 *   remembered in the browser, and the equal-power curves the audio engine
 *   gives its Web Audio gains. When to fade is the shared rule
 *   (`crossfadeLength` in @musonic/core).
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useSyncExternalStore } from 'react';
import { MAX_CROSSFADE } from '@musonic/core';

const CROSSFADE_KEY = 'musonic.crossfade';

function clamp(seconds: number): number {
  return Number.isFinite(seconds) ? Math.min(MAX_CROSSFADE, Math.max(0, Math.round(seconds))) : 0;
}

function readCrossfade(): number {
  try {
    return clamp(Number(localStorage.getItem(CROSSFADE_KEY)));
  } catch {
    return 0;
  }
}

let seconds = readCrossfade();
const listeners = new Set<() => void>();

/** Current setting, read by the engine when it decides. */
export function getCrossfade(): number {
  return seconds;
}

export function setCrossfade(value: number): void {
  seconds = clamp(value);
  try {
    localStorage.setItem(CROSSFADE_KEY, String(seconds));
  } catch {
    // The setting is a convenience: losing it is harmless.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCrossfade(): number {
  return useSyncExternalStore(subscribe, getCrossfade);
}

/** Equal-power gain curve: sin from 0 to 1 when fading in, cos from 1 to 0 when fading out. */
export function equalPowerCurve(fadeIn: boolean, steps = 128): Float32Array {
  const curve = new Float32Array(steps);
  for (let i = 0; i < steps; i++) {
    const angle = (i / (steps - 1)) * (Math.PI / 2);
    curve[i] = fadeIn ? Math.sin(angle) : Math.cos(angle);
  }
  return curve;
}
