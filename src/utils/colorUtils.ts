/**
 * @file colorUtils.ts
 * @description Pure colour utility functions: hex blending and deterministic
 *   ID-to-colour mapping used as fallback backgrounds before artwork loads,
 *   and hex-to-rgba conversion for tinted shadows.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
export function blendWithBlack(hex: string, factor = 0.5): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return '#282828';
  const r = Math.round(parseInt(clean.slice(0, 2), 16) * (1 - factor));
  const g = Math.round(parseInt(clean.slice(2, 4), 16) * (1 - factor));
  const b = Math.round(parseInt(clean.slice(4, 6), 16) * (1 - factor));
  const d = (v: number) => v.toString(16).padStart(2, '0');
  return `#${d(r)}${d(g)}${d(b)}`;
}

/** `#RRGGBB` + alpha (0-1) → `rgba(r,g,b,a)`. Falls back to black. */
export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}

function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60)       { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  const hex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/**
 * Derives a consistent, visually distinct dark color from any string (album/track ID).
 * Used as fallback when native image color extraction is unavailable.
 */
export function colorFromId(id: string): string {
  let hash = 5381;
  for (let i = 0; i < id.length; i++) {
    // eslint-disable-next-line no-bitwise
    hash = ((hash << 5) + hash + id.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash % 360);
  // eslint-disable-next-line no-bitwise
  const sat = 55 + Math.abs((hash >> 8) % 25);  // 55–80 %
  // eslint-disable-next-line no-bitwise
  const lit = 22 + Math.abs((hash >> 16) % 14); // 22–36 % (dark enough for white text)
  return hslToHex(hue, sat, lit);
}
