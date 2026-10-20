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
