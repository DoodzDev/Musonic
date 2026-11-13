/**
 * @file SettingsDialog.tsx
 * @description Settings of the web client, opened from the profile menu, in the
 *   mobile app's order: playback (crossfade between tracks, 0 to 12 s, then the
 *   time left, remembered in the browser); the language (English / French),
 *   shared with the website; Musonic Connect and scrobbling (ListenBrainz,
 *   Last.fm) on a Musonic Server. Escape or a click outside closes it.
 * @author DoodzProg
 * @version 0.4.0
 * @license CC-BY-NC-4.0
 */

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MAX_CROSSFADE } from '@musonic/core';
import { useApp } from '../context/AppContext.tsx';
import { lang, setLang, tr, type Lang } from '../i18n/index.ts';
import { ApiError, v1 } from '../lib/musonicApi.ts';
import { useConnect } from '../player/ConnectContext.ts';
import { setCrossfade, useCrossfade } from '../player/crossfade.ts';
import { setShowRemaining, useShowRemaining } from '../player/timeDisplay.ts';
import { CloseIcon } from './icons/CloseIcon.tsx';
import { Slider } from './Slider.tsx';

const t = tr.settings;
// Each language is named in itself, so it can be found whatever the current one.
const LANGUAGES: { id: Lang; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'fr', name: 'Français' },
];

/** Musonic Connect (ADR-019): this browser's name (synced playback is in « Listen on »). */
function ConnectSettings() {
  const connect = useConnect();
  const [name, setName] = useState(connect?.name ?? '');
  if (!connect) return null;
  const c = tr.connect;
  return (
    <div className="setting">
      <span className="setting-label">{c.section}</span>
      <label className="field-label">
        <span>{c.deviceName}</span>
        <span className="field">
        <input
          className="field-input"
          value={name}
          maxLength={64}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => connect.setName(name)}
          onKeyDown={(e) => e.key === 'Enter' && connect.setName(name)}
        />
        </span>
      </label>
      <p className="setting-hint">{c.adminNotice}</p>
    </div>
  );
}

type ServiceState = { connected: boolean; name: string | null; problem: string | null; pending: number; available?: boolean };
type ScrobblingState = { listenbrainz: ServiceState; lastfm: ServiceState };

/** Scrobbling on a Musonic Server (version 5): hidden when the server has none. */
function ScrobblingSettings() {
  const { session } = useApp();
  const s = t.scrobbling;
  const [state, setState] = useState<ScrobblingState | null>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waitingLastfm, setWaitingLastfm] = useState(false);

  const load = useCallback(() => {
    v1<ScrobblingState>(session, '/v1/me/scrobbling').then(setState).catch(() => setState(null));
  }, [session]);
  useEffect(load, [load]);
  // Back from Last.fm's page: the new account shows up (then the waiting stops).
  const lastfmPending = waitingLastfm && !state?.lastfm.connected;
  useEffect(() => {
    if (!lastfmPending) return;
    const timer = setInterval(load, 3000);
    window.addEventListener('focus', load);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', load);
    };
  }, [lastfmPending, load]);

  if (!state) return null;
  const run = (work: Promise<ScrobblingState>, refused?: string) => {
    setBusy(true);
    setError(null);
    work
      .then((next) => {
        setState(next);
        setToken('');
      })
      .catch((e: unknown) => setError(refused && e instanceof ApiError && e.status === 422 ? refused : s.failed))
      .finally(() => setBusy(false));
  };
  const disconnect = (service: 'listenbrainz' | 'lastfm') => run(v1<ScrobblingState>(session, `/v1/me/scrobbling/${service}`, { method: 'DELETE' }));
  const connectLastfm = () => {
    setError(null);
    // Opened at once (a pop-up allowed by the click), then sent to Last.fm.
    const tab = window.open('about:blank', '_blank');
    v1<{ url: string }>(session, '/v1/me/scrobbling/lastfm', { method: 'POST', body: { serverUrl: session.baseUrl } })
      .then(({ url }) => {
        if (tab) tab.location.href = url;
        else window.location.assign(url);
        setWaitingLastfm(true);
      })
      .catch(() => {
        tab?.close();
        setError(s.failed);
      });
  };
  const status = (v: ServiceState) => (
    <>
      <p className="setting-hint">{v.connected ? (v.name ? s.connectedAs(v.name) : s.connected) : s.notConnected}</p>
      {v.problem && <p className="setting-hint is-warning">{s.refused}</p>}
      {v.connected && v.pending > 0 && <p className="setting-hint">{s.pending(v.pending)}</p>}
    </>
  );

  return (
    <div className="setting">
      <span className="setting-label">{s.section}</span>
      <p className="setting-hint">{s.hint}</p>
      <div className="scrobble-service">
        <span className="scrobble-name">ListenBrainz</span>
        {status(state.listenbrainz)}
        {state.listenbrainz.connected && !state.listenbrainz.problem ? (
          <button type="button" className="btn-quiet" disabled={busy} onClick={() => disconnect('listenbrainz')}>{s.disconnect}</button>
        ) : (
          <>
            <label className="field-label">
              <span>{s.token}</span>
              <span className="field">
                <input
                  className="field-input"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && token.trim() && !busy && run(v1(session, '/v1/me/scrobbling/listenbrainz', { method: 'PUT', body: { token } }), s.tokenRefused)}
                />
              </span>
            </label>
            <p className="setting-hint">{s.tokenHint}</p>
            <button
              type="button"
              className="btn-tinted"
              disabled={busy || !token.trim()}
              onClick={() => run(v1(session, '/v1/me/scrobbling/listenbrainz', { method: 'PUT', body: { token } }), s.tokenRefused)}>
              {s.connect}
            </button>
          </>
        )}
      </div>
      <div className="scrobble-service">
        <span className="scrobble-name">Last.fm</span>
        {state.lastfm.available === false && !state.lastfm.connected ? (
          <p className="setting-hint">{s.lastfmUnavailable}</p>
        ) : (
          <>
            {status(state.lastfm)}
            {state.lastfm.connected && !state.lastfm.problem ? (
              <button type="button" className="btn-quiet" disabled={busy} onClick={() => disconnect('lastfm')}>{s.disconnect}</button>
            ) : (
              <>
                <button type="button" className="btn-tinted" disabled={busy} onClick={connectLastfm}>{s.lastfmConnect}</button>
                {lastfmPending && <p className="setting-hint">{s.lastfmWaiting}</p>}
              </>
            )}
          </>
        )}
      </div>
      {error && <p className="setting-hint is-warning" role="alert">{error}</p>}
    </div>
  );
}

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const showRemaining = useShowRemaining();
  const crossfade = useCrossfade();
  const crossfadeText = crossfade > 0 ? t.crossfadeSeconds(crossfade) : t.crossfadeOff;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // At the root of the page: above the player bar and the phone Dock, whatever opened it.
  return createPortal(
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={t.title}>
        <div className="dialog-head">
          <h2 className="dialog-title">{t.title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t.close} title={t.close}>
            <CloseIcon size={18} />
          </button>
        </div>
        <div className="setting">
          <span className="setting-label">{t.player}</span>
          <span>{t.crossfade}</span>
          <div className="setting-slider">
            <Slider value={crossfade} max={MAX_CROSSFADE} step={1} label={t.crossfade} valueText={crossfadeText} onChange={setCrossfade} />
            <span className="setting-value" aria-hidden="true">{crossfadeText}</span>
          </div>
          <p className="setting-hint">{t.crossfadeHint}</p>
          <label className="setting-switch">
            <span>{t.showRemaining}</span>
            <input type="checkbox" role="switch" aria-checked={showRemaining} checked={showRemaining} onChange={(e) => setShowRemaining(e.target.checked)} />
          </label>
        </div>
        <div className="setting">
          <span className="setting-label" id="setting-language">{t.language}</span>
          <div className="chips" role="radiogroup" aria-labelledby="setting-language">
            {LANGUAGES.map((l) => (
              <button
                key={l.id}
                type="button"
                role="radio"
                aria-checked={lang === l.id}
                className={'chip' + (lang === l.id ? ' is-on' : '')}
                lang={l.id}
                onClick={() => setLang(l.id)}>
                {l.name}
              </button>
            ))}
          </div>
          <p className="setting-hint">{t.languageHint}</p>
        </div>
        <ConnectSettings />
        <ScrobblingSettings />
      </div>
    </div>,
    document.body,
  );
}
