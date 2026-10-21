/**
 * @file ImportPlaylistDialog.tsx
 * @description Imports a Spotify or Deezer playlist into Musonic (ADR-020): the address is read
 *   (name, cover, songs), the import runs on the server while its progress shows, then the
 *   report lists what was not found. A Spotify playlist of more than 100 songs is completed with
 *   the address of a second playlist holding the rest (or pasted song links). Musonic Server only.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import type { PlaylistImport, PlaylistImportDetail, PlaylistPreview } from '@musonic/core';
import { useApp } from '../context/AppContext.tsx';
import { tr } from '../i18n/index.ts';
import { ApiError, v1 } from '../lib/musonicApi.ts';
import { keys } from '../player/usePlayItem.ts';

const t = tr.importPlaylist;
const POLL_MS = 1000;

type Step = { kind: 'address' } | { kind: 'preview'; preview: PlaylistPreview; request: Request } | { kind: 'import'; id: string };
type Request = { url: string } | { text: string };

/** Several song links pasted (or line breaks): a list, else an address. */
function requestOf(input: string): Request {
  const value = input.trim();
  return /\s/.test(value) ? { text: value } : { url: value };
}

function errorText(e: unknown): string {
  if (!(e instanceof ApiError)) return t.errors.generic;
  if (e.status === 404) return t.errors.notFound;
  if (e.status === 429) return t.errors.busy;
  if (e.status === 502 || e.status === 0) return t.errors.unavailable;
  if (e.status === 501) return e.message.includes('spotify') ? t.errors.spotify : t.errors.catalog;
  if (e.status === 400) return e.message.includes('links') ? t.errors.noLinks : t.errors.notPlaylist;
  return t.errors.generic;
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
}

function Address({ onPreview }: { onPreview: (preview: PlaylistPreview, request: Request) => void }) {
  const { session } = useApp();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const read = async () => {
    const request = requestOf(input);
    setBusy(true);
    setError(null);
    try {
      onPreview(await v1<PlaylistPreview>(session, '/v1/playlist-imports/preview', { method: 'POST', body: request }), request);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="dialog-body"
      onSubmit={(e) => {
        e.preventDefault();
        if (input.trim() && !busy) void read();
      }}>
      <p>{t.sub}</p>
      <label className="field-label">
        <span>{t.urlLabel}</span>
        <span className="field">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t.urlPlaceholder} autoFocus spellCheck={false} />
        </span>
      </label>
      {error && <p className="import-error">{error}</p>}
      <div className="dialog-actions">
        <button type="submit" className="btn-primary btn-play" disabled={!input.trim() || busy}>{busy ? t.reading : t.read}</button>
      </div>
    </form>
  );
}

function Preview({ preview, request, onStarted }: { preview: PlaylistPreview; request: Request; onStarted: (id: string) => void }) {
  const { session } = useApp();
  const [name, setName] = useState(preview.name ?? t.defaultName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const partial = preview.total != null && preview.total > preview.read;
  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const started = await v1<PlaylistImport>(session, '/v1/playlist-imports', { method: 'POST', body: { ...request, name: name.trim() } });
      onStarted(started.id);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  return (
    <form
      className="dialog-body"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim() && !busy) void start();
      }}>
      <div className="import-head">
        {preview.coverUrl ? <img className="import-cover" src={preview.coverUrl} alt="" /> : <span className="import-cover" />}
        <div>
          <strong>{preview.name ?? t.links(preview.read)}</strong>
          <span>{[preview.source === 'spotify' ? 'Spotify' : 'Deezer', preview.owner && t.by(preview.owner), preview.name && t.songs(preview.total ?? preview.read)].filter(Boolean).join(' · ')}</span>
        </div>
      </div>
      {partial && <p className="import-note">{t.partialNote(preview.read, preview.total ?? 0)}</p>}
      <label className="field-label">
        <span>{t.nameLabel}</span>
        <span className="field">
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </span>
      </label>
      {error && <p className="import-error">{error}</p>}
      <div className="dialog-actions">
        <button type="submit" className="btn-primary btn-play" disabled={!name.trim() || busy}>{busy ? t.starting : t.start}</button>
      </div>
    </form>
  );
}

function Report({ id, onClose }: { id: string; onClose: () => void }) {
  const { session, cache } = useApp();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<PlaylistImportDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    v1<PlaylistImportDetail>(session, `/v1/playlist-imports/${encodeURIComponent(id)}`)
      .then(setDetail)
      .catch((e: unknown) => setError(errorText(e)));
  }, [session, id]);
  useEffect(load, [load]);
  const state = detail?.import.state;
  const running = state === 'pending' || state === 'running';
  useEffect(() => {
    if (detail && !running) return;
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [detail, running, load]);
  useEffect(() => {
    // The new playlist shows in the library and the side panel.
    if (state === 'done') cache.invalidate(keys.playlists);
  }, [state, cache]);

  const retry = async () => {
    setBusy(true);
    setError(null);
    try {
      await v1(session, `/v1/playlist-imports/${encodeURIComponent(id)}/retry`, { method: 'POST' });
      setDetail(null);
      load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const complete = async () => {
    setBusy(true);
    setError(null);
    try {
      await v1(session, '/v1/playlist-imports', { method: 'POST', body: { ...requestOf(paste), into: id } });
      setPaste('');
      setDetail(null);
      load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (!detail) return <div className="dialog-body">{error ? <p className="import-error">{error}</p> : <p>{t.running}…</p>}</div>;
  const imp = detail.import;
  if (running) {
    const pct = imp.total ? Math.round((imp.done / imp.total) * 100) : 0;
    return (
      <div className="dialog-body">
        <p><strong>{imp.name}</strong></p>
        <div className="import-bar" role="progressbar" aria-valuemin={0} aria-valuemax={imp.total} aria-valuenow={imp.done}><i style={{ width: `${pct}%` }} /></div>
        <p>{t.progress(imp.done, imp.total)}</p>
        <p className="setting-hint">{t.background}</p>
      </div>
    );
  }
  const found = imp.library + imp.online + imp.uncertain;
  const toCheck = detail.tracks.filter((s) => s.status === 'missing' || s.status === 'uncertain');
  const partial = imp.source === 'spotify' && imp.sourceTotal != null && imp.sourceTotal > imp.total;
  return (
    <div className="dialog-body">
      {state === 'failed' ? (
        <p className="import-error">{t.failed}</p>
      ) : (
        <p>
          <strong>{imp.name}</strong> · {t.found(found)}
          <br />
          {[imp.library && t.library(imp.library), imp.online && t.online(imp.online), imp.uncertain && t.uncertain(imp.uncertain), imp.missing && t.missing(imp.missing)].filter(Boolean).join(' · ')}
        </p>
      )}
      {toCheck.length > 0 && (
        <>
          <p className="import-subtitle">{t.check}</p>
          <ul className="import-list">
            {toCheck.map((s) => (
              <li key={s.position}>
                <span>
                  <strong>{s.title || s.link}</strong>
                  <span>{s.artists.join(', ')}</span>
                </span>
                <em className={s.status === 'missing' ? 'is-missing' : ''}>{s.status === 'uncertain' ? t.uncertainTag : (t.reasons[s.reason ?? ''] ?? t.reasons.not_found)}</em>
              </li>
            ))}
          </ul>
          {imp.uncertain > 0 && <p className="setting-hint">{t.uncertainHint}</p>}
        </>
      )}
      {partial && (
        <div className="import-paste">
          <p>
            <strong>{t.partial(imp.total, imp.sourceTotal ?? 0)}</strong> {t.pasteHow((imp.sourceTotal ?? 0) - imp.total)}
          </p>
          {imp.appLink && <a className="btn-tinted import-open" href={imp.appLink}>{t.openSpotify}</a>}
          <label className="field-label">
            <span>{t.pasteLabel}</span>
            <span className="field field-area">
              <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={2} placeholder={t.pastePlaceholder} spellCheck={false} />
            </span>
          </label>
          <div className="dialog-actions">
            <button type="button" className="btn-tinted" disabled={!paste.trim() || busy} onClick={() => void complete()}>{t.complete}</button>
          </div>
        </div>
      )}
      {error && <p className="import-error">{error}</p>}
      <div className="dialog-actions">
        {imp.missing > 0 && (
          <button type="button" className="btn-quiet" disabled={busy} onClick={() => void retry()}>{t.retry}</button>
        )}
        {imp.playlistId && (
          <button
            type="button"
            className="btn-primary btn-play"
            onClick={() => {
              onClose();
              navigate(`/playlist/${imp.playlistId}`);
            }}>
            {t.seePlaylist}
          </button>
        )}
      </div>
    </div>
  );
}

/** `importId`: open on that import's report (from a playlist's page). */
export function ImportPlaylistDialog({ importId, onClose }: { importId?: string; onClose: () => void }) {
  const [step, setStep] = useState<Step>(importId ? { kind: 'import', id: importId } : { kind: 'address' });
  useEscape(onClose);
  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-label={t.title}>
        <div className="dialog-head">
          <h2 className="dialog-title">{step.kind === 'import' && importId ? t.report : t.title}</h2>
          <button type="button" className="btn-quiet" onClick={onClose}>{tr.common.close}</button>
        </div>
        {step.kind === 'address' && <Address onPreview={(preview, request) => setStep({ kind: 'preview', preview, request })} />}
        {step.kind === 'preview' && <Preview preview={step.preview} request={step.request} onStarted={(id) => setStep({ kind: 'import', id })} />}
        {step.kind === 'import' && <Report id={step.id} onClose={onClose} />}
      </div>
    </div>
  );
}
