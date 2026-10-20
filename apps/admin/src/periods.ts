/**
 * @file periods.ts
 * @description Periods of the « Données » page (a day, a week, a month, a year) and their
 *   steps (hours, days, weeks, months), in the browser's time zone. The server adds up its
 *   hourly measures between the edges given here.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { t } from './i18n/index.ts';

export type Period = 'day' | 'week' | 'month' | 'year';
export type Step = 'hour' | 'day' | 'week' | 'month';

/** The steps each period can show, the first one by default. */
export const STEPS: Record<Period, Step[]> = {
  day: ['hour'],
  week: ['day', 'hour'],
  month: ['day', 'week'],
  year: ['month', 'week'],
};

/** Start of the period holding `at`, moved by `offset` periods. */
export function periodStart(period: Period, at: Date, offset = 0): Date {
  const y = at.getFullYear(), m = at.getMonth(), d = at.getDate();
  switch (period) {
    case 'day':
      return new Date(y, m, d + offset);
    case 'week': {
      const monday = d - ((at.getDay() + 6) % 7);
      return new Date(y, m, monday + offset * 7);
    }
    case 'month':
      return new Date(y, m + offset, 1);
    case 'year':
      return new Date(y + offset, 0, 1);
  }
}

export function periodEnd(period: Period, start: Date): Date {
  return periodStart(period, start, 1);
}

/** The first boundary of a step after `d`. */
function next(step: Step, d: Date): Date {
  const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
  switch (step) {
    case 'hour':
      return new Date(y, m, day, d.getHours() + 1);
    case 'day':
      return new Date(y, m, day + 1);
    case 'week':
      return new Date(y, m, day + 7 - ((d.getDay() + 6) % 7));
    case 'month':
      return new Date(y, m + 1, 1);
  }
}

/** Unix seconds from the start to the end of the period, one edge per step. */
export function edges(start: Date, end: Date, step: Step): number[] {
  const out = [start.getTime() / 1000];
  for (let d = next(step, start); d < end; d = next(step, d)) out.push(d.getTime() / 1000);
  out.push(end.getTime() / 1000);
  return out;
}

/** The edges of a period around now (`offset` periods before), and whether it is under way. */
export function periodEdges(period: Period, offset: number, step: Step) {
  const start = periodStart(period, new Date(), offset);
  const end = periodEnd(period, start);
  return { start, ends: edges(start, end, step), current: end.getTime() > Date.now() };
}

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(t.locale, o);

/** "octobre 2026", "2026", "20 octobre 2026", "semaine du 19 oct. 2026". */
export function periodLabel(period: Period, start: Date): string {
  switch (period) {
    case 'day':
      return fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(start);
    case 'week':
      return t.data.weekOf(fmt({ day: 'numeric', month: 'short', year: 'numeric' }).format(start));
    case 'month':
      return fmt({ month: 'long', year: 'numeric' }).format(start);
    case 'year':
      return String(start.getFullYear());
  }
}

/** Short label of a bucket on the axis ("14 h", "lun. 20", "20 oct.", "oct."). */
export function stepLabel(step: Step, period: Period, at: Date): string {
  switch (step) {
    case 'hour':
      return period === 'day' ? t.data.hour(at.getHours()) : fmt({ weekday: 'short', hour: 'numeric' }).format(at);
    case 'day':
      return period === 'week' ? fmt({ weekday: 'short', day: 'numeric' }).format(at) : String(at.getDate());
    case 'week':
      return fmt({ day: 'numeric', month: 'short' }).format(at);
    case 'month':
      return fmt({ month: 'short' }).format(at);
  }
}

/** Full label of a bucket, for the tooltip and the table. */
export function bucketLabel(step: Step, at: Date): string {
  switch (step) {
    case 'hour':
      return fmt({ weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(at);
    case 'day':
      return fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(at);
    case 'week':
      return t.data.weekOf(fmt({ day: 'numeric', month: 'long' }).format(at));
    case 'month':
      return fmt({ month: 'long', year: 'numeric' }).format(at);
  }
}
