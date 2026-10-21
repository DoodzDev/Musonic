/**
 * @file ImportsPage.tsx
 * @description « Imports »: the queue of online songs to download into the library (try again,
 *   remove), the import settings, the audio providers and their credential (the ARL for
 *   Deezer), changed here without a terminal and never shown.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@musonic/icons';
import type { ImportJob, ImportList, ProviderInfo } from '@musonic/core';
import { useAutoRefresh } from '../refresh.ts';
import { api, ApiError } from '../api.ts';
import { relative } from '../format.ts';
import { t } from '../i18n/index.ts';
import { useServerSettings } from '../serverSettings.ts';
import { ErrorLine, Modal, Seg, Toggle } from '../components/ui.tsx';
import { RestartNote } from '../components/Restart.tsx';

type State = 'all' | 'pending' | 'running' | 'failed' | 'done';
const STATES: State[] = ['all', 'pending', 'running', 'failed', 'done'];
const PAGE = 100;

const providerName = (id: string) => t.imports.providerNames[id] ?? id;

function stateTag(j: ImportJob): [string, string] {
  switch (j.state) {
    case 'running':
      return ['accent', t.imports.stateOf.running];
    case 'done':
      return ['ok', t.imports.stateOf.done];
    case 'failed':
      return ['bad', t.imports.stateOf.failed];
    default:
      return ['wait', t.imports.stateOf.pending];
  }
}

function attemptsText(j: ImportJob): string {
  if (j.state === 'pending' && j.attempts > 0) return `${j.attempts} · ${t.imports.nextTry(relative(j.nextTryAt).toLowerCase())}`;
  return String(j.attempts);
}

function CredentialModal({ p, onClose, onSaved }: { p: ProviderInfo; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const credential = p.credential ?? '';
  const save = () => {
    setBusy(true);
    setError(null);
    api(`/v1/admin/providers/${encodeURIComponent(p.id)}/credential`, { method: 'PUT', body: { value } })
      .then(() => {
        onSaved();
        onClose();
      })
      .catch((e: ApiError) => setError(e.status === 422 ? t.imports.credRefused : e.message))
      .finally(() => setBusy(false));
  };
  return (
    <Modal title={t.imports.credTitle(credential, providerName(p.id))} onClose={onClose}>
      <p className="muted small">{t.imports.credHelp}</p>
      <div className="field">
        <label>{credential}</label>
        <input className="input" type="password" autoComplete="off" spellCheck={false} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && value.trim() && !busy && save()} autoFocus />
      </div>
      <p className="note">{t.imports.credStored}</p>
      <ErrorLine error={error} />
      <div className="actions">
        <button className="btn ghost" onClick={onClose}>{t.common.cancel}</button>
        <button className="btn primary" disabled={!value.trim() || busy} onClick={save}>{busy ? t.imports.credChecking : t.imports.credSave}</button>
      </div>
    </Modal>
  );
}

export function ImportsPage() {
  const [state, setState] = useState<State>('all');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [list, setList] = useState<ImportList | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [changing, setChanging] = useState<ProviderInfo | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const settings = useServerSettings();

  const load = useCallback(() => {
    const q = new URLSearchParams({ limit: String(limit) });
    if (state !== 'all') q.set('state', state);
    if (search.trim()) q.set('q', search.trim());
    Promise.all([api<ImportList>(`/v1/admin/imports?${q}`), api<ProviderInfo[]>('/v1/admin/providers')])
      .then(([l, p]) => {
        setList(l);
        setProviders(p);
      })
      .catch((e: Error) => setError(e.message));
  }, [state, search, limit]);
  useEffect(load, [load]);
  useAutoRefresh(load);

  const act = (p: Promise<unknown>) => {
    setError(null);
    p.then(load).catch((e: Error) => setError(e.message));
  };
  const counts = list?.counts;
  const failed = counts?.failed ?? 0;
  const importOn = settings.value('import');

  return (
    <>
      <div className="head">
        <div><h1>{t.imports.title}</h1><p className="sub">{t.imports.sub}</p></div>
        {failed > 0 && <button className="btn" onClick={() => act(api('/v1/admin/imports/retry-failed', { method: 'POST' }))}><Icon name="refresh" size={16} /> {t.imports.retryFailed(failed)}</button>}
      </div>
      <RestartNote needed={settings.restartNeeded} />
      {importOn === false && <p className="note">{t.imports.off}</p>}
      <ErrorLine error={error ?? settings.error} />

      <div className="grid g4">
        {(['pending', 'running', 'failed', 'done'] as const).map((s) => (
          <button key={s} type="button" className="card stat" style={{ textAlign: 'left' }} onClick={() => setState(s)}>
            <b>{(counts?.[s] ?? 0).toLocaleString(t.locale)}</b><span>{t.imports.counts[s]}</span>
          </button>
        ))}
      </div>

      <div className="filters mt">
        <Seg<State> value={state} options={STATES.map((s) => [s, t.imports.states[s]])} onChange={(s) => { setState(s); setLimit(PAGE); }} />
        <label className="search"><Icon name="search" size={16} /><input placeholder={t.imports.search} value={search} onChange={(e) => { setSearch(e.target.value); setLimit(PAGE); }} /></label>
      </div>

      <div className="card mt-s" style={{ padding: '8px 6px' }}>
        <table>
          <thead><tr><th>{t.imports.track}</th><th className="hide-s">{t.imports.requestedBy}</th><th>{t.imports.state}</th><th className="hide-s">{t.imports.attempts}</th><th /></tr></thead>
          <tbody>
            {list?.jobs.map((j) => {
              const [kind, label] = stateTag(j);
              const open = j.state === 'pending' || j.state === 'failed';
              return (
                <tr key={j.trackId}>
                  <td><b>{j.title}</b> <span className="muted small">{j.artist}{j.album ? ` · ${j.album}` : ''}</span></td>
                  <td className="hide-s">{j.requestedBy ?? '—'}</td>
                  <td>
                    <span className={`tag ${kind}`}>{label}</span>
                    {j.lastError && j.state !== 'done' && <div className="muted small" title={j.lastError}>{j.lastError.length > 80 ? `${j.lastError.slice(0, 80)}…` : j.lastError}</div>}
                    {j.state === 'done' && j.path && <div className="muted small" style={{ wordBreak: 'break-all' }}>{j.path}</div>}
                  </td>
                  <td className="small hide-s">{attemptsText(j)}</td>
                  <td>
                    {open && (
                      <div className="row" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn sm" onClick={() => act(api(`/v1/admin/imports/${encodeURIComponent(j.trackId)}/retry`, { method: 'POST' }))}>{t.imports.retry}</button>
                        <button className="btn sm danger" title={t.imports.removeHelp} onClick={() => act(api(`/v1/admin/imports/${encodeURIComponent(j.trackId)}`, { method: 'DELETE' }))}>{t.imports.remove}</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {list && list.jobs.length === 0 && <tr><td colSpan={5} className="empty">{t.imports.empty}</td></tr>}
          </tbody>
        </table>
        {list && list.total > list.jobs.length && (
          <div className="spread small" style={{ padding: '8px 12px' }}>
            <span className="muted">{t.imports.shown(list.jobs.length, list.total)}</span>
            <button className="btn sm" onClick={() => setLimit((l) => l + PAGE)}>{t.imports.more}</button>
          </div>
        )}
      </div>

      <div className="grid g2 mt">
        <div className="card">
          <h2>{t.imports.settings}</h2>
          {settings.loaded && (
            <>
              <div className="setting"><div><b>{t.imports.auto[0]}</b><p>{t.imports.auto[1]}</p></div><Toggle label={t.imports.auto[0]} on={importOn === true} onChange={(on) => settings.set('import', on)} /></div>
              <div className="setting">
                <div><b>{t.imports.quality[0]}</b><p>{t.imports.quality[1]}</p></div>
                <Seg value={String(settings.value('import_quality'))} options={['mp3_128', 'mp3_320', 'flac'].map((q) => [q, t.imports.qualities[q]])} onChange={(q) => settings.set('import_quality', q)} />
              </div>
              <div className="setting"><div><b>{t.imports.folder[0]}</b><p>{t.imports.folder[1]}</p></div></div>
            </>
          )}
        </div>
        <div className="card">
          <h2>{t.imports.providers}</h2>
          {providers.map((p) => (
            <div key={p.id} className="list-item">
              <div className="small">
                <b>{providerName(p.id)}</b> · {p.imports ? t.imports.full : t.imports.preview}
                <div className={p.alert ? 'tag bad' : 'muted'}>
                  {p.alert ? t.imports.expired : t.imports.ok}
                  {p.credentialChangedAt ? ` · ${p.credential} ${t.imports.changed(relative(p.credentialChangedAt).toLowerCase())}` : ''}
                </div>
              </div>
              {p.credential && <button className={'btn sm' + (p.alert ? ' primary' : '')} style={{ marginLeft: 'auto' }} onClick={() => setChanging(p)}>{t.imports.change(p.credential)}</button>}
            </div>
          ))}
          {providers.length === 0 && <p className="muted small">{t.imports.noProviders}</p>}
          {settings.loaded && (
            <>
              <div className="setting mt"><div><b>{t.imports.online[0]}</b><p>{t.imports.online[1]}</p></div><Toggle label={t.imports.online[0]} on={settings.value('online') === true} onChange={(on) => settings.set('online', on)} /></div>
              <div className="setting"><div><b>{t.imports.previews[0]}</b><p>{t.imports.previews[1]}</p></div><Toggle label={t.imports.previews[0]} on={settings.value('online_previews') === true} onChange={(on) => settings.set('online_previews', on)} /></div>
            </>
          )}
          {notice && <p className="muted small mt-s"><Icon name="check" size={14} /> {notice}</p>}
        </div>
      </div>

      {changing && <CredentialModal p={changing} onClose={() => setChanging(null)} onSaved={() => { setNotice(t.imports.credDone); load(); }} />}
    </>
  );
}
