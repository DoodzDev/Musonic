/**
 * @file traffic.ts
 * @description Measures of the server for the console (« Données », dashboard): loading them,
 *   and this month's outbound traffic against the host's allowance.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useCallback, useEffect, useState } from 'react';
import type { Measures } from '@musonic/core';
import { api } from './api.ts';
import { t } from './i18n/index.ts';
import { periodEnd, periodStart } from './periods.ts';
import { useAutoRefresh } from './refresh.ts';

export const MUSONIC = 'var(--c-musonic)';
export const OTHERS = 'var(--c-other)';

/** "12", "0,4": a share in percent. */
export const pct = (part: number, of: number) => (of > 0 ? ((part / of) * 100).toLocaleString(t.locale, { maximumFractionDigits: part / of < 0.1 ? 1 : 0 }) : '0');

export function fetchMeasures(list: number[]): Promise<Measures> {
  return api<Measures>('/v1/admin/measures', { method: 'POST', body: { edges: list } });
}

/** Outbound traffic this month: sent, the host's allowance, Musonic's share, the pace. */
export function monthTraffic(m: Measures, now = Date.now() / 1000) {
  const start = periodStart('month', new Date()).getTime() / 1000;
  const end = periodEnd('month', new Date(start * 1000)).getTime() / 1000;
  const b = m.buckets[0];
  const sent = m.hostVisible ? b?.hostTx ?? 0 : b?.appTx ?? 0;
  const from = Math.max(start, m.since ?? now);
  const elapsed = now - from;
  // At least an hour measured to guess the month.
  const projected = elapsed >= 3600 ? (sent / elapsed) * (end - start) : null;
  return { sent, musonic: b?.appTx ?? 0, quota: m.quotaOutBytes, projected, partial: from > start + 3600, from };
}

export function useMonthTraffic() {
  const [m, setM] = useState<Measures | null>(null);
  const load = useCallback(() => {
    const start = periodStart('month', new Date());
    fetchMeasures([start.getTime() / 1000, periodEnd('month', start).getTime() / 1000]).then(setM).catch(() => {});
  }, []);
  useEffect(load, [load]);
  useAutoRefresh(load);
  return [m, load] as const;
}
