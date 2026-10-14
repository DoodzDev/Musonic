/**
 * @file backdrop.ts
 * @description How much to darken a blurred cover used as a background, so
 *   white text stays readable over light covers while dark covers keep their
 *   colour.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

/** Lightest the background may stay after darkening (0–1 sRGB), white text ≥ ~5:1. */
const MAX_BRIGHTNESS = 0.4;
/** Darkening applied even to dark covers: keeps the "slightly darker" look. */
const MIN_DIM = 0.25;
/** Never fully black: a very light cover still shows a hint of its colour. */
const MAX_DIM = 0.7;

/** Opacity (0–1) of a black layer over a cover whose average colour is `hex` (#RRGGBB). */
export function backdropDim(hex: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return MIN_DIM;
  const brightness = (parseInt(m[1], 16) + parseInt(m[2], 16) + parseInt(m[3], 16)) / (3 * 255);
  if (brightness <= 0) return MIN_DIM;
  const needed = 1 - MAX_BRIGHTNESS / brightness;
  return Math.min(MAX_DIM, Math.max(MIN_DIM, needed));
}
