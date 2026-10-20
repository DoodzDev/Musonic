/**
 * @file DataPage.tsx
 * @description « Données »: what the server consumes. Outbound traffic this month against the
 *   host's allowance (and Musonic's share), traffic in and out over a day, week, month or year
 *   by hour, day, week or month, processor, memory, and the disk in detail with its trend.
 *   From the server's hourly measures; the period in progress stays live.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@musonic/icons';
import type { AdminStatus, Measure, Measures } from '@musonic/core';
import { api } from '../api.ts';
import { bytes, date, rate, relative } from '../format.ts';
import { useAutoRefresh } from '../refresh.ts';
import { useStatus } from '../useStatus.ts';
import { t } from '../i18n/index.ts';
import { Chart, type Series } from '../components/Chart.tsx';
import { ErrorLine, Modal, Seg } from '../components/ui.tsx';
import { STEPS, bucketLabel, periodEdges, periodLabel, stepLabel, type Period, type Step } from '../periods.ts';
import { MUSONIC, OTHERS, fetchMeasures, monthTraffic, pct, useMonthTraffic } from '../traffic.ts';
import { QuotaMeter } from '../components/QuotaMeter.tsx';

function QuotaModal({ current, onClose, onSaved }: { current: number; onClose: () => void; onSaved: () => void }) {
  const [limited, setLimited] = useState<'yes' | 'no'>(current > 0 ? 'yes' : 'no');
  // Under 1 TB, in GB.
  const [unit, setUnit] = useState<'gb' | 'tb'>(current > 0 && current < 1e12 ? 'gb' : 'tb');
  const [amount, setAmount] = useState(current > 0 ? String(current / (unit === 'gb' ? 1e9 : 1e12)).replace('.', t.locale === 'fr' ? ',' : '.') : '10');
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    const v = Number(amount.replace(',', '.'));
    if (limited === 'yes' && (!Number.isFinite(v) || v <= 0)) return setError(t.data.quotaInvalid);
    const outBytes = limited === 'yes' ? Math.round(v * (unit === 'gb' ? 1e9 : 1e12)) : 0;
    api('/v1/admin/traffic-quota', { method: 'PUT', body: { outBytes } })
      .then(() => {
        onSaved();
        onClose();
      })
      .catch((e: Error) => setError(e.message));
  };
  return (
    <Modal title={t.data.quotaTitle} onClose={onClose}>
      <p className="sub">{t.data.quotaHelp}</p>
      <div className="field mt-s">
        <Seg value={limited} options={[['yes', t.data.quotaLimited], ['no', t.common.unlimited]]} onChange={setLimited} />
      </div>
      {limited === 'yes' && (
        <div className="field mt-s">
          <label htmlFor="quota">{t.data.quotaLabel}</label>
          <div className="row">
            <input id="quota" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
            <Seg value={unit} options={[['gb', t.data.unitGb], ['tb', t.data.unitTb]]} onChange={setUnit} />
          </div>
        </div>
      )}
      <ErrorLine error={error} />
      <div className="actions">
        <button type="button" className="btn" onClick={onClose}>{t.common.cancel}</button>
        <button type="button" className="btn primary" onClick={save}>{t.common.save}</button>
      </div>
    </Modal>
  );
}

function DiskDetail({ s, rows, ends }: { s: AdminStatus | null | undefined; rows: Measure[]; ends: number[] }) {
  const d = s?.disk;
  // The trend: how much the disk took between the first and the last measure of the period.
  const known = rows.map((r, i) => [ends[i + 1], r.diskUsed] as const).filter((x): x is readonly [number, number] => x[1] != null);
  const music = rows.map((r) => r.musicBytes).filter((v): v is number => v != null);
  let trend: string | null = null;
  if (known.length >= 2 && d) {
    const [[t0, u0], [t1, u1]] = [known[0], known[known.length - 1]];
    const perDay = ((u1 - u0) / Math.max(1, t1 - t0)) * 86400;
    trend = perDay > 1e6 ? t.data.fullIn(Math.round(d.freeBytes / perDay).toLocaleString(t.locale)) : t.data.notGrowing;
  }
  const growth = music.length >= 2 ? music[music.length - 1] - music[0] : null;
  return (
    <div className="card">
      <h2>{t.data.diskDetail}</h2>
      {d ? (
        <>
          <div className="spread small"><span><b>{t.data.diskUsed}</b> · {t.dashboard.of(bytes(d.totalBytes - d.freeBytes), bytes(d.totalBytes))}</span><span className="muted">{t.data.free(bytes(d.freeBytes))}</span></div>
          <div className="bar mt-s"><i style={{ width: `${((d.totalBytes - d.freeBytes) / d.totalBytes) * 100}%`, background: OTHERS }} /></div>
        </>
      ) : (
        <p className="muted small">{t.dashboard.diskUnknown}</p>
      )}
      {s && (
        <dl className="kv mt">
          <dt>{t.dashboard.musicLabel}</dt><dd>{bytes(s.library.bytes)}{d ? ` · ${t.dashboard.ofDisk(pct(s.library.bytes, d.totalBytes))}` : ''}</dd>
          <dt>{t.data.imports}</dt><dd>{bytes(s.library.importedBytes)}</dd>
          <dt>{t.dashboard.database}</dt><dd>{bytes(s.folders.databaseBytes)}</dd>
          <dt>{t.dashboard.backups}</dt><dd>{s.folders.backups} · {bytes(s.folders.backupsBytes)}{s.folders.lastBackupAt ? t.dashboard.lastBackup(relative(s.folders.lastBackupAt).toLowerCase()) : ''}</dd>
          <dt>{t.dashboard.caches}</dt><dd>{bytes(s.folders.cacheBytes)}</dd>
          {growth !== null && <><dt>{t.data.musicGrowth}</dt><dd>{growth >= 0 ? '+' : '−'}{bytes(Math.abs(growth))}</dd></>}
        </dl>
      )}
      {trend && <p className="note mt">{trend}</p>}
    </div>
  );
}

export function DataPage() {
  const status = useStatus();
  const [period, setPeriod] = useState<Period>('month');
  const [step, setStep] = useState<Step>('day');
  const [offset, setOffset] = useState(0);
  const [m, setM] = useState<Measures | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [month, reloadMonth] = useMonthTraffic();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable while the period does not change.
  const { start, ends, current } = useMemo(() => periodEdges(period, offset, step), [period, offset, step]);
  const load = useCallback(() => {
    fetchMeasures(ends)
      .then((r) => {
        setM(r);
        setLoadedAt(Date.now() / 1000);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [ends]);
  useEffect(load, [load]);
  useAutoRefresh(current ? load : noop);

  const choose = (p: Period) => {
    setPeriod(p);
    setStep(STEPS[p][0]);
    setOffset(0);
  };

  const rows = m?.buckets ?? [];
  // Buckets still to come stay empty.
  const value = (r: Measure, v: number) => (r.start > loadedAt ? null : v);
  const labels = rows.map((r) => stepLabel(step, period, new Date(r.start * 1000)));
  const titles = rows.map((r) => bucketLabel(step, new Date(r.start * 1000)));
  const host = m?.hostVisible ?? false;
  const traffic = (pick: (r: Measure) => [number, number]): Series[] => [
    { label: t.data.musonic, color: MUSONIC, values: rows.map((r) => value(r, pick(r)[1])) },
    ...(host ? [{ label: t.data.others, color: OTHERS, values: rows.map((r) => value(r, Math.max(0, pick(r)[0] - pick(r)[1]))) }] : []),
  ];
  const sum = (f: (r: Measure) => number) => rows.reduce((s, r) => s + f(r), 0);
  const [hostTx, hostRx, appTx, appRx] = [sum((r) => r.hostTx), sum((r) => r.hostRx), sum((r) => r.appTx), sum((r) => r.appRx)];
  const cpu = rows.filter((r) => r.cpuPercent != null);
  const cpuAvg = cpu.length ? cpu.reduce((s, r) => s + (r.cpuPercent ?? 0) * r.hours, 0) / Math.max(1, cpu.reduce((s, r) => s + r.hours, 0)) : null;
  const memPeak = Math.max(0, ...rows.map((r) => r.memoryMax ?? 0));
  const live = status?.live;
  const percent = (v: number) => `${v.toLocaleString(t.locale, { maximumFractionDigits: v < 10 ? 1 : 0 })} %`;
  const traffic0 = month ? monthTraffic(month, loadedAt || undefined) : null;

  return (
    <>
      <div className="head">
        <div>
          <h1>{t.data.title}</h1>
          <p className="sub">{t.data.sub}{m?.since ? ` ${t.data.since(date(m.since))}` : ''}</p>
        </div>
        {live && (
          <span className="tag"><span className="dotlive" />{t.data.live} · <Icon name="upload-arrow" size={12} /> {rate(live.hostVisible ? live.hostTxBytesPerSec : live.txBytesPerSec)} · <Icon name="download-arrow" size={12} /> {rate(live.hostVisible ? live.hostRxBytesPerSec : live.rxBytesPerSec)}</span>
        )}
      </div>

      {month && traffic0 && (
        <div className="card">
          <div className="spread">
            <div>
              <h2 style={{ margin: 0 }}>{t.data.monthSent}</h2>
              <p className="muted small" style={{ margin: '2px 0 0' }}>{traffic0.partial ? t.data.measuredSince(date(traffic0.from)) : t.data.monthReset}</p>
            </div>
            <button type="button" className="btn ghost sm" onClick={() => setEditing(true)}><Icon name="pencil" size={14} /> {t.data.quotaEdit}</button>
          </div>
          <div className="hero mt-s">
            <b>{bytes(traffic0.sent)}</b>
            <span className="muted">{traffic0.quota > 0 ? t.data.quotaOf(bytes(traffic0.quota), pct(traffic0.sent, traffic0.quota)) : t.data.noQuota}</span>
          </div>
          <QuotaMeter m={month} />
          {!month.hostVisible && <p className="note mt-s">{t.data.hostHidden}</p>}
        </div>
      )}

      <div className="filters mt">
        <Seg value={period} options={[['day', t.data.periods.day], ['week', t.data.periods.week], ['month', t.data.periods.month], ['year', t.data.periods.year]]} onChange={choose} />
        <div className="row period">
          <button type="button" className="btn ghost sm" aria-label={t.data.prev} onClick={() => setOffset(offset - 1)}><Icon name="back-arrow" size={14} /></button>
          <b>{periodLabel(period, start)}</b>
          <button type="button" className="btn ghost sm" aria-label={t.data.next} disabled={offset >= 0} onClick={() => setOffset(Math.min(0, offset + 1))}><Icon name="chevron-right" size={14} /></button>
          {offset < 0 && <button type="button" className="btn sm" onClick={() => setOffset(0)}>{t.data.backToNow}</button>}
        </div>
        {STEPS[period].length > 1 && <Seg value={step} options={STEPS[period].map((s) => [s, t.data.steps[s]] as [Step, string])} onChange={setStep} />}
      </div>
      <ErrorLine error={error} />

      <div className="grid g4 mt-s">
        {host && <div className="card stat"><b>{bytes(hostTx)}</b><span>{t.data.sentMachine}</span></div>}
        {host && <div className="card stat"><b>{bytes(hostRx)}</b><span>{t.data.receivedMachine}</span></div>}
        <div className="card stat"><b>{bytes(appTx)}</b><span>{t.data.sentMusonic}</span>{host && <><br /><em>{t.data.shareOf(pct(appTx, hostTx))}</em></>}</div>
        <div className="card stat"><b>{bytes(appRx)}</b><span>{t.data.receivedMusonic}</span>{host && <><br /><em>{t.data.shareOf(pct(appRx, hostRx))}</em></>}</div>
      </div>

      <div className="grid g2 mt">
        <Chart title={t.data.sent} kind="bars" labels={labels} titles={titles} series={traffic((r) => [r.hostTx, r.appTx])} format={bytes} />
        <Chart title={t.data.received} kind="bars" labels={labels} titles={titles} series={traffic((r) => [r.hostRx, r.appRx])} format={bytes} />
        <Chart
          title={t.data.cpu}
          aside={cpuAvg !== null && <span className="muted small">{t.data.average(percent(cpuAvg))}</span>}
          kind="line" labels={labels} titles={titles} format={percent}
          series={[{ label: t.data.cpu, color: MUSONIC, values: rows.map((r) => r.cpuPercent ?? null) }]}
        />
        <Chart
          title={t.data.memory}
          aside={memPeak > 0 && <span className="muted small">{t.data.peak(bytes(memPeak))}</span>}
          kind="line" labels={labels} titles={titles} format={bytes}
          series={[{ label: t.data.memory, color: MUSONIC, values: rows.map((r) => r.memoryMax ?? null) }]}
        />
        <Chart
          title={t.data.diskChart} kind="line" labels={labels} titles={titles} format={bytes}
          series={[
            { label: t.data.diskUsed, color: OTHERS, values: rows.map((r) => r.diskUsed ?? null) },
            { label: t.dashboard.musicLabel, color: MUSONIC, values: rows.map((r) => r.musicBytes ?? null) },
          ]}
        />
        <DiskDetail s={status} rows={rows} ends={ends} />
      </div>
      <p className="muted small mt">{t.data.howMeasured}</p>

      {editing && month && <QuotaModal current={month.quotaOutBytes} onClose={() => setEditing(false)} onSaved={() => { reloadMonth(); load(); }} />}
    </>
  );
}

function noop() {}
