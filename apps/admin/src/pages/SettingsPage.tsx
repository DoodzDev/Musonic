/**
 * @file SettingsPage.tsx
 * @description Settings and maintenance: the console's language, Musonic Web hosted at `/app`,
 *   backups (now, how many days, download), caches, update checks, restarting the server, the
 *   size of the activity log, the server's last log lines.
 * @author DoodzProg
 * @version 0.3.0
 * @license CC-BY-NC-4.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@musonic/icons';
import type { Backup, JournalPage, JournalSize, LogLine, WebApp } from '@musonic/core';
import { api, ApiError, session } from '../api.ts';
import { bytes, date, relative } from '../format.ts';
import { LANGS, lang, setLang, t, type Lang } from '../i18n/index.ts';
import { useServerSettings } from '../serverSettings.ts';
import { useStatus } from '../useStatus.ts';
import { ErrorLine, Seg, Toggle } from '../components/ui.tsx';
import { RestartButton, RestartNote } from '../components/Restart.tsx';

const MB = 1000 * 1000;
const SIZES = [10, 50, 100, 250, 500, 1000, 5000].map((n) => n * MB);
const DAYS = [0, 3, 7, 14, 30, 90];
const LOG_MS = 3000;
const LOG_KEEP = 500;

function JournalCard() {
  const [size, setSize] = useState<JournalSize | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api<JournalPage>('/v1/admin/journal?limit=1')
      .then((r) => setSize(r.size))
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  const choose = (maxBytes: number) => {
    api<JournalSize>('/v1/admin/journal/settings', { method: 'PUT', body: { maxBytes } })
      .then(setSize)
      .catch((e: Error) => setError(e.message));
  };
  const options = size && !SIZES.includes(size.maxBytes) ? [...SIZES, size.maxBytes].sort((a, b) => a - b) : SIZES;
  return (
    <div className="card">
      <h2>{t.journal.settingsTitle}</h2>
      <p className="muted small" style={{ marginTop: 0 }}>{t.journal.settingsHelp}</p>
      {size && (
        <>
          <div className="spread small"><span>{t.journal.used(bytes(size.bytes), size.lines.toLocaleString(t.locale))}</span><span className="muted">{Math.round((size.bytes / size.maxBytes) * 100)} %</span></div>
          <div className="bar mt-s"><i style={{ width: `${Math.min(100, (size.bytes / size.maxBytes) * 100)}%` }} /></div>
          {size.oldest && <p className="muted small mt-s">{t.journal.oldest(date(size.oldest))}</p>}
          <div className="setting">
            <div><b>{t.journal.maxSize}</b></div>
            <select className="input" style={{ width: 'auto' }} value={size.maxBytes} onChange={(e) => choose(Number(e.target.value))}>
              {options.map((b) => <option key={b} value={b}>{bytes(b)}</option>)}
            </select>
          </div>
        </>
      )}
      <ErrorLine error={error} />
    </div>
  );
}

function WebAppCard() {
  const [web, setWeb] = useState<WebApp | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<WebApp>('/v1/admin/webapp').then(setWeb).catch((e: Error) => setError(e.message));
  }, []);
  const install = () => {
    setBusy(true);
    setError(null);
    api<WebApp>('/v1/admin/webapp/install', { method: 'POST' })
      .then(setWeb)
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  };
  const url = `${location.origin}/app/`;
  const update = web?.installed && web.latest && web.installed !== web.latest;
  return (
    <div className="card" style={{ gridColumn: '1/-1' }}>
      <div className="spread"><h2 style={{ margin: 0 }}>{t.settings.webapp}</h2><span className="muted small">{web?.installed ? t.settings.webappInstalled(web.installed) : t.settings.webappNone}</span></div>
      <p className="muted small">{t.settings.webappHelp(url)}</p>
      {web && (
        <div className="setting">
          <div><b>Musonic Web</b><p>{web.latest ? t.settings.webappLatest(web.latest) : t.settings.webappNoRelease}</p></div>
          <div className="row">
            {web.installed && <a className="btn sm" href={url} target="_blank" rel="noreferrer"><Icon name="globe" size={14} /> {t.settings.open}</a>}
            {web.latest && (
              <button className={'btn sm' + (!web.installed || update ? ' primary' : '')} disabled={busy} onClick={install}>
                {busy ? t.settings.installing : !web.installed ? t.settings.install : update ? t.settings.updateTo(web.latest) : t.settings.reinstall}
              </button>
            )}
          </div>
        </div>
      )}
      <ErrorLine error={error} />
    </div>
  );
}

/** Saves a backup through the session (a plain link could not send it). */
async function download(name: string) {
  const res = await fetch(`/v1/admin/backups/${encodeURIComponent(name)}`, { headers: { Authorization: `Bearer ${session.token ?? ''}` } });
  if (!res.ok) throw new ApiError(res.status, t.common.error(res.status));
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function BackupsCard({ days, onDays }: { days: number | undefined; onDays: (d: number) => void }) {
  const [list, setList] = useState<Backup[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api<{ backups: Backup[] }>('/v1/admin/backups').then((r) => setList(r.backups)).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  const now = () => {
    setBusy(true);
    setError(null);
    api('/v1/admin/backups', { method: 'POST' })
      .then(load)
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  };
  const last = list?.[0];
  const options = days === undefined || DAYS.includes(days) ? DAYS : [...DAYS, days].sort((a, b) => a - b);
  return (
    <div className="card">
      <h2>{t.settings.backups}</h2>
      <p className="muted small" style={{ marginTop: 0 }}>{t.settings.backupsHelp}</p>
      <div className="spread small">
        <span>{last ? t.settings.lastBackup(relative(last.at).toLowerCase(), bytes(last.size)) : t.settings.noBackup}</span>
        <button className="btn sm primary" disabled={busy} onClick={now}>{busy ? t.settings.backingUp : t.settings.backupNow}</button>
      </div>
      {days !== undefined && (
        <div className="setting mt-s">
          <div><b>{t.settings.keep}</b></div>
          <select className="input" style={{ width: 'auto' }} value={days} onChange={(e) => onDays(Number(e.target.value))}>
            {options.map((d) => <option key={d} value={d}>{d ? t.settings.days(d) : t.settings.keepOff}</option>)}
          </select>
        </div>
      )}
      {list?.slice(0, 7).map((b) => (
        <div key={b.name} className="list-item">
          <div className="small">{b.name}<div className="muted">{date(b.at)} · {bytes(b.size)}</div></div>
          <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => download(b.name).catch((e: Error) => setError(e.message))}><Icon name="download-arrow" size={14} /> {t.settings.download}</button>
        </div>
      ))}
      <p className="note mt-s">{t.settings.backupsSecret}</p>
      <ErrorLine error={error} />
    </div>
  );
}

function MaintenanceCard({ updateCheck, onUpdateCheck }: { updateCheck: boolean | undefined; onUpdateCheck: (on: boolean) => void }) {
  const status = useStatus();
  const [freed, setFreed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clear = () => {
    setError(null);
    api<{ freed: number }>('/v1/admin/caches/clear', { method: 'POST' })
      .then((r) => setFreed(r.freed))
      .catch((e: Error) => setError(e.message));
  };
  return (
    <div className="card">
      <h2>{t.settings.maintenance}</h2>
      <div className="setting"><div><b>{t.settings.restartTitle}</b><p>{t.settings.restartHelp}</p></div><RestartButton label={t.settings.restart} /></div>
      <div className="setting">
        <div><b>{t.settings.caches}</b><p>{t.settings.cachesHelp}</p>{(freed !== null || status) && <p>{freed !== null ? t.settings.cleared(bytes(freed)) : t.settings.cachesSize(bytes(status?.folders.cacheBytes ?? 0))}</p>}</div>
        <button className="btn sm" onClick={clear}><Icon name="trash" size={14} /> {t.settings.clear}</button>
      </div>
      {updateCheck !== undefined && (
        <div className="setting"><div><b>{t.settings.updates[0]}</b><p>{t.settings.updates[1]}</p></div><Toggle label={t.settings.updates[0]} on={updateCheck} onChange={onUpdateCheck} /></div>
      )}
      <ErrorLine error={error} />
    </div>
  );
}

type Level = 'info' | 'warn' | 'error';

function LogsCard() {
  const [level, setLevel] = useState<Level>('info');
  const [lines, setLines] = useState<LogLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const after = useRef(0);
  useEffect(() => {
    let alive = true;
    after.current = 0;
    const load = () =>
      api<LogLine[]>(`/v1/admin/logs?level=${level}&after=${after.current}`)
        .then((more) => {
          if (!alive || more.length === 0) return;
          after.current = more[more.length - 1].id;
          const el = box.current;
          const atBottom = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          setLines((old) => [...old, ...more].slice(-LOG_KEEP));
          if (atBottom) requestAnimationFrame(() => el && (el.scrollTop = el.scrollHeight));
        })
        .catch((e: Error) => alive && setError(e.message));
    void load();
    const timer = setInterval(() => document.visibilityState === 'visible' && load(), LOG_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [level]);
  return (
    <div className="card" style={{ gridColumn: '1/-1' }}>
      <div className="spread">
        <h2 style={{ margin: 0 }}>{t.settings.logs}</h2>
        <Seg<Level> value={level} options={(['info', 'warn', 'error'] as const).map((l) => [l, t.settings.levels[l]])} onChange={(l) => { setLines([]); setLevel(l); }} />
      </div>
      <p className="muted small">{t.settings.logsHelp}</p>
      <div className="log mt-s" ref={box}>
        {lines.map((l) => (
          <div key={l.id} className={l.level === 'ERROR' ? 'e' : l.level === 'WARN' ? 'w' : undefined}>{l.text}</div>
        ))}
        {lines.length === 0 && <div>{t.settings.noLogs}</div>}
      </div>
      <ErrorLine error={error} />
    </div>
  );
}

export function SettingsPage() {
  const settings = useServerSettings();
  const days = settings.value('backup_days');
  const updateCheck = settings.value('update_check');
  return (
    <>
      <div className="head"><div><h1>{t.settings.title}</h1></div></div>
      <RestartNote needed={settings.restartNeeded} />
      <ErrorLine error={settings.error} />
      <div className="grid g2">
        <WebAppCard />
        <BackupsCard days={typeof days === 'number' ? days : undefined} onDays={(d) => settings.set('backup_days', d)} />
        <MaintenanceCard updateCheck={typeof updateCheck === 'boolean' ? updateCheck : undefined} onUpdateCheck={(on) => settings.set('update_check', on)} />
        <div className="card">
          <h2>{t.settings.language}</h2>
          <Seg<Lang> value={lang} options={(Object.keys(LANGS) as Lang[]).map((l) => [l, LANGS[l].name])} onChange={setLang} />
          <p className="muted small mt-s">{t.settings.languageHelp}</p>
        </div>
        <JournalCard />
        <LogsCard />
      </div>
    </>
  );
}
