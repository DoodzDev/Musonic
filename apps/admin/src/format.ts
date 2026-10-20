/**
 * @file format.ts
 * @description Dates and durations as the console shows them (French).
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

/** "il y a 3 h", "dans 7 jours", from Unix seconds. */
export function relative(seconds: number | null | undefined): string {
  if (!seconds) return 'Jamais';
  const diff = seconds - Date.now() / 1000;
  const abs = Math.abs(diff);
  const [value, unit]: [number, Intl.RelativeTimeFormatUnit] =
    abs < 60 ? [diff, 'second'] : abs < 3600 ? [diff / 60, 'minute'] : abs < 86400 ? [diff / 3600, 'hour'] : [diff / 86400, 'day'];
  if (abs < 45) return diff < 0 ? "À l'instant" : 'Dans un instant';
  return rtf.format(Math.round(value), unit);
}

export function date(seconds: number): string {
  return new Intl.DateTimeFormat('fr', { dateStyle: 'medium', timeStyle: 'short' }).format(seconds * 1000);
}

export const UNITS = { secondes: 1, minutes: 60, heures: 3600, jours: 86400 } as const;
export type Unit = keyof typeof UNITS;

/** "6,5 Go", "38 Mo". */
export function bytes(n: number): string {
  if (n < 1e3) return `${n} o`;
  const [v, u] = n < 1e6 ? [n / 1e3, 'ko'] : n < 1e9 ? [n / 1e6, 'Mo'] : n < 1e12 ? [n / 1e9, 'Go'] : [n / 1e12, 'To'];
  return `${v.toLocaleString('fr', { maximumFractionDigits: v < 10 ? 1 : 0 })} ${u}`;
}

/** "1,8 Mo/s". */
export function rate(perSec: number): string {
  return `${bytes(perSec)}/s`;
}

/** "3 j 4 h", "2 h 05", "12 min". */
export function uptime(secs: number): string {
  const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600), m = Math.floor((secs % 3600) / 60);
  if (d) return `${d} j ${h} h`;
  if (h) return `${h} h ${String(m).padStart(2, '0')}`;
  return `${m} min`;
}

/** "101 h d'écoute". */
export function hours(secs: number): string {
  return `${Math.round(secs / 3600).toLocaleString('fr')} h`;
}
