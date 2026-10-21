/**
 * @file LibraryPage.tsx
 * @description « Bibliothèque »: scans (quick or full) and their result, the songs with their
 *   files, the lists to look at (missing files, duplicates, no cover, online without a file),
 *   listening to check a file, the automatic scan setting. Clicking a song opens its page.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@musonic/icons';
import type { LibraryOverview, TrackPage, TrackRow } from '@musonic/core';
import { useAutoRefresh } from '../refresh.ts';
import { api } from '../api.ts';
import { relative } from '../format.ts';
import { t } from '../i18n/index.ts';
import { useServerSettings } from '../serverSettings.ts';
import { ErrorLine } from '../components/ui.tsx';
import { ListenButton } from '../components/Listen.tsx';
import { coverUrl } from '../listen.ts';
import { RestartNote } from '../components/Restart.tsx';

type Filter = 'all' | 'missing' | 'duplicates' | 'nocover' | 'online';
const FILTERS: Filter[] = ['all', 'missing', 'duplicates', 'nocover', 'online'];
const PAGE = 100;
const EVERY = [0, 60, 360, 1440];

/** "MP3 · 320 kbit/s". */
function formatOf(format: string | null, bitRate: number | null): string {
  if (!format) return '—';
  return [format.toUpperCase(), bitRate ? `${bitRate} kbit/s` : ''].filter(Boolean).join(' · ');
}

/** What the last scan did, from the server's report. */
function lastScanText(o: LibraryOverview): string | null {
  const s = o.lastScan as Record<string, unknown> | null;
  if (!s) return null;
  const n = (k: string) => (typeof s[k] === 'number' ? (s[k] as number) : 0);
  const errors = Array.isArray(s.errors) ? s.errors.length : n('errors');
  return t.library.lastScan(n('files').toLocaleString(t.locale), n('files_missing'), n('tracks_added'), errors, (n('duration_ms') / 1000).toLocaleString(t.locale, { maximumFractionDigits: 1 }));
}

function sourceTag(r: TrackRow): [string, string] {
  if (r.source === 'missing') return ['bad', t.library.sources.missing];
  if (r.source === 'online') return ['wait', t.library.sources.online];
  return ['', t.library.sources.file];
}

export function LibraryPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [overview, setOverview] = useState<LibraryOverview | null>(null);
  const [page, setPage] = useState<TrackPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const settings = useServerSettings();
  const navigate = useNavigate();

  const loadOverview = useCallback(() => {
    api<LibraryOverview>('/v1/admin/library').then(setOverview).catch((e: Error) => setError(e.message));
  }, []);
  const loadTracks = useCallback(() => {
    const q = new URLSearchParams({ limit: String(limit) });
    if (filter !== 'all') q.set('filter', filter);
    if (search.trim()) q.set('q', search.trim());
    api<TrackPage>(`/v1/admin/library/tracks?${q}`).then(setPage).catch((e: Error) => setError(e.message));
  }, [filter, search, limit]);
  useEffect(loadOverview, [loadOverview]);
  useEffect(loadTracks, [loadTracks]);
  useAutoRefresh(loadOverview);

  const scan = (full: boolean) => {
    setError(null);
    api('/v1/admin/library/scan', { method: 'POST', body: { full } })
      .then(() => setOverview((o) => (o ? { ...o, scanning: true } : o)))
      .catch((e: Error) => setError(e.message));
  };
  const count = (f: Filter): number | null => {
    if (!overview) return null;
    return { all: overview.tracks, missing: overview.missing, duplicates: overview.duplicates, nocover: overview.noCover, online: overview.online }[f];
  };
  const interval = Number(settings.value('scan_interval_minutes') ?? 60);
  const intervals = EVERY.includes(interval) ? EVERY : [...EVERY, interval].sort((a, b) => a - b);
  const last = overview && lastScanText(overview);

  return (
    <>
      <div className="head">
        <div>
          <h1>{t.library.title}</h1>
          <p className="sub">
            {!overview ? '…' : !overview.enabled ? t.library.noFolder : overview.scanning ? t.library.scanning : t.library.sub(overview.tracks.toLocaleString(t.locale), relative(overview.lastScanAt).toLowerCase())}
          </p>
        </div>
        {overview?.enabled && (
          <div className="row">
            <button className="btn" disabled={overview.scanning} title={t.library.fullHelp} onClick={() => scan(false)}><Icon name="refresh" size={16} /> {t.library.quick}</button>
            <button className="btn" disabled={overview.scanning} title={t.library.fullHelp} onClick={() => scan(true)}>{t.library.full}</button>
          </div>
        )}
      </div>
      <RestartNote needed={settings.restartNeeded} />
      {last && <p className="muted small" style={{ marginTop: -8 }}>{last}</p>}
      <ErrorLine error={error ?? settings.error} />

      <div className="tabs" role="tablist">
        {FILTERS.map((f) => {
          const n = count(f);
          return (
            <button key={f} type="button" role="tab" aria-selected={f === filter} className={f === filter ? 'on' : ''} onClick={() => { setFilter(f); setLimit(PAGE); }}>
              {t.library.tabs[f]}{n !== null && f !== 'all' && <span className="muted"> {n.toLocaleString(t.locale)}</span>}
            </button>
          );
        })}
      </div>
      {t.library.tabHelp[filter] && <p className="muted small" style={{ marginTop: -6 }}>{t.library.tabHelp[filter]}</p>}
      <label className="search" style={{ maxWidth: 420 }}><Icon name="search" size={16} /><input placeholder={t.library.search} value={search} onChange={(e) => { setSearch(e.target.value); setLimit(PAGE); }} /></label>

      <div className="card mt-s" style={{ padding: '8px 6px' }}>
        <table>
          <thead><tr><th>{t.library.track}</th><th className="hide-s">{t.library.album}</th><th className="hide-s">{t.library.format}</th><th>{t.library.source}</th><th /></tr></thead>
          <tbody>
            {page?.tracks.map((r) => {
              const [kind, label] = sourceTag(r);
              return (
                <tr key={r.id} className="click" onClick={() => navigate(`/library/${r.id}`)}>
                  <td><div className="row"><img className="cover" src={coverUrl(r.id, 80)} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} /><div><b>{r.title}</b><div className="muted small">{r.artist}</div></div></div></td>
                  <td className="hide-s">{r.album ?? '—'}</td>
                  <td className="small hide-s">{formatOf(r.format, r.bitRate)}</td>
                  <td><span className={`tag ${kind}`}>{label}</span></td>
                  <td style={{ textAlign: 'right' }}>{r.fileId && r.source === 'file' && <ListenButton item={{ fileId: r.fileId, trackId: r.id, title: r.title, artist: r.artist }} />}</td>
                </tr>
              );
            })}
            {page && page.tracks.length === 0 && <tr><td colSpan={5} className="empty">{t.library.empty}</td></tr>}
          </tbody>
        </table>
        {page && page.total > page.tracks.length && (
          <div className="spread small" style={{ padding: '8px 12px' }}>
            <span className="muted">{t.imports.shown(page.tracks.length, page.total)}</span>
            <button className="btn sm" onClick={() => setLimit((l) => l + PAGE)}>{t.imports.more}</button>
          </div>
        )}
      </div>

      {settings.loaded && overview?.enabled && (
        <div className="card mt">
          <div className="setting">
            <div><b>{t.library.scanEvery[0]}</b><p>{t.library.scanEvery[1]}</p></div>
            <select className="input" style={{ width: 'auto' }} value={interval} onChange={(e) => settings.set('scan_interval_minutes', Number(e.target.value))}>
              {intervals.map((m) => <option key={m} value={m}>{t.library.every[m] ?? t.library.everyMinutes(m)}</option>)}
            </select>
          </div>
        </div>
      )}
    </>
  );
}
