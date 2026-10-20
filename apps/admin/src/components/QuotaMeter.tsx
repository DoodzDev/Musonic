/**
 * @file QuotaMeter.tsx
 * @description This month's outbound traffic against the host's allowance: Musonic's part,
 *   the other services', and where the month is heading.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import type { Measures } from '@musonic/core';
import { bytes } from '../format.ts';
import { t } from '../i18n/index.ts';
import { MUSONIC, OTHERS, monthTraffic, pct } from '../traffic.ts';

export function QuotaMeter({ m }: { m: Measures }) {
  const { sent, musonic, quota, projected } = monthTraffic(m);
  const of = quota > 0 ? quota : Math.max(sent, 1);
  const w = (v: number) => `${Math.min(100, (v / of) * 100)}%`;
  return (
    <>
      <div className="bar mt-s quota" role="img" aria-label={t.data.quotaAria(bytes(sent), quota ? bytes(quota) : '∞')}>
        <i style={{ width: w(musonic), background: MUSONIC }} />
        {m.hostVisible && sent > musonic && <i style={{ width: w(sent - musonic), background: OTHERS }} />}
      </div>
      <div className="spread small mt-s">
        <span><span className="legend" style={{ background: MUSONIC }} />{t.data.musonic} {bytes(musonic)}{m.hostVisible ? ` · ${t.data.shareOf(pct(musonic, sent))}` : ''}</span>
        {m.hostVisible && <span><span className="legend" style={{ background: OTHERS }} />{t.data.others} {bytes(Math.max(0, sent - musonic))}</span>}
      </div>
      {projected !== null && <p className="muted small mt-s">{t.data.projection(bytes(projected))}{quota > 0 ? ` (${pct(projected, quota)} %)` : ''}</p>}
    </>
  );
}
