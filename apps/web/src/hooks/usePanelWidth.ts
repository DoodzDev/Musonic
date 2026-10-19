/**
 * @file usePanelWidth.ts
 * @description Width of a resizable panel (see ResizeHandle), remembered on this browser.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useState } from 'react';

export interface Limits {
  initial: number;
  min: number;
  max: number;
}

function read(key: string, { initial, min, max }: Limits): number {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v >= min && v <= max ? v : initial;
  } catch {
    return initial;
  }
}

function save(key: string, width: number): void {
  try {
    localStorage.setItem(key, String(Math.round(width)));
  } catch {
    // Width is a convenience.
  }
}

export function usePanelWidth(key: string, limits: Limits) {
  const [width, setWidth] = useState(() => read(key, limits));
  const clamp = (w: number) => Math.min(limits.max, Math.max(limits.min, w));
  return {
    width,
    limits,
    set: (w: number, persist: boolean) => {
      const next = clamp(w);
      setWidth(next);
      if (persist) save(key, next);
    },
  };
}
