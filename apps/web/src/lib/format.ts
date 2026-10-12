/**
 * @file format.ts
 * @description Duration formatting helpers.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

/** 252 → "4:12". */
export function formatTime(seconds: number | undefined): string {
  if (!seconds || !Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 15120 → "4 h 12", 2580 → "43 min". */
export function formatTotal(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}
