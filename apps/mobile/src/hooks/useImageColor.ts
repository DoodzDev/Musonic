/**
 * @file useImageColor.ts
 * @description Hook that extracts the dominant color from the active track's
 *   artwork and updates playerStore.dominantColor for ambient player backgrounds.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {useEffect} from 'react';
import ImageColors from 'react-native-image-colors';
import {useActiveTrack} from 'react-native-track-player';
import {getCoverArtUrl} from '../api/client';
import {usePlayerStore} from '../store/playerStore';
import {colorFromId} from '../utils/colorUtils';

export function useImageColor() {
  const activeTrack = useActiveTrack();
  const coverArt = activeTrack?.coverArt ? String(activeTrack.coverArt) : undefined;
  const trackId  = activeTrack?.id ? String(activeTrack.id) : undefined;
  const setDominantColor = usePlayerStore(s => s.setDominantColor);

  useEffect(() => {
    const fallback = trackId ? colorFromId(trackId) : '#3D1F0F';
    setDominantColor(fallback);

    if (!coverArt) return;

    let url: string;
    try {
      url = getCoverArtUrl(coverArt, 200);
    } catch {
      return;
    }

    let cancelled = false;

    ImageColors.getColors(url, {fallback, cache: true})
      .then(result => {
        if (cancelled) return;
        // Pick the most vibrant available colour depending on platform
        let raw: string = fallback;
        if (result.platform === 'android') {
          raw = (result as any).dominant
             ?? (result as any).vibrant
             ?? (result as any).average
             ?? fallback;
        } else if (result.platform === 'ios') {
          raw = (result as any).background
             ?? (result as any).primary
             ?? fallback;
        }
        setDominantColor(toGradientColor(raw));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [coverArt, trackId, setDominantColor]);
}

// ─── Colour processing ────────────────────────────────────────────────────────
// Takes the raw extracted hex, boosts saturation, and locks lightness ≤ 30 %
// so white text always remains readable over the gradient.

function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  if (c.length !== 6) return [61, 31, 15];
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;
  if (delta === 0) return [0, 0, l];
  const s = delta / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (max === rn)      h = ((gn - bn) / delta) % 6;
  else if (max === gn) h = (bn - rn) / delta + 2;
  else                 h = (rn - gn) / delta + 4;
  return [((h * 60) + 360) % 360, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if      (h < 60)  { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else              { r = c; b = x; }
  const round = (v: number) => Math.round((v + m) * 255);
  return [round(r), round(g), round(b)];
}

function toGradientColor(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const [h, s]    = rgbToHsl(r, g, b);
  const finalS    = Math.min(1, Math.max(0.55, s * 1.2)); // boost saturation
  const finalL    = 0.28;                                  // ≤ 30 % — text-safe
  const [fr, fg, fb] = hslToRgb(h, finalS, finalL);
  const hex2 = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return `#${hex2(fr)}${hex2(fg)}${hex2(fb)}`;
}
