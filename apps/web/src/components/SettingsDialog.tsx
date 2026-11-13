/**
 * @file SettingsDialog.tsx
 * @description Settings of the web client, opened from the profile menu, in the
 *   mobile app's order: playback (crossfade between tracks, 0 to 12 s, then the
 *   time left, remembered in the browser); the language (English / French),
 *   shared with the website; Musonic Connect and scrobbling (ListenBrainz,
 *   Last.fm) on a Musonic Server, in two columns on a computer. Explanations hide
 *   behind a circled "i". Escape or a click outside closes it.
 * @author DoodzProg
 * @version 0.6.0
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
import { InfoTip } from './InfoTip.tsx';
import { formatTime } from '../lib/format.ts';
import { usePlayer } from '../player/PlayerContext.tsx';
import { usePosition } from '../player/position.ts';
import { useTransport } from '../player/transport.ts';
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
        <span className="label-with-info">{c.deviceName} <InfoTip text={c.adminNotice} label={c.deviceName} /></span>
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
  const [tokenOpen, setTokenOpen] = useState(false);

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
        setTokenOpen(false);
      })
      .catch((e: unknown) => setError(refused && e instanceof ApiError && e.status === 422 ? refused : s.failed))
      .finally(() => setBusy(false));
  };
  const disconnect = (service: 'listenbrainz' | 'lastfm') => run(v1<ScrobblingState>(session, `/v1/me/scrobbling/${service}`, { method: 'DELETE' }));
  const sendToken = () => token.trim() && !busy && run(v1(session, '/v1/me/scrobbling/listenbrainz', { method: 'PUT', body: { token } }), s.tokenRefused);
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
  const line = (v: ServiceState) =>
    v.problem ? s.refused : v.connected ? (v.name ? s.connectedAs(v.name) : s.connected) : s.notConnected;
  const lastfmOff = state.lastfm.available === false && !state.lastfm.connected;
  const lb = state.listenbrainz;
  const lf = state.lastfm;

  // One line per service: its name and state, the action on the right.
  return (
    <div className="setting">
      <span className="setting-label label-with-info">{s.section} <InfoTip text={s.hint} label={s.section} /></span>
      <div className="scrobble-row">
        <span className="scrobble-text">
          <span className="scrobble-name">ListenBrainz</span>
          <span className={'scrobble-state' + (lb.problem ? ' is-warning' : '')}>
            {line(lb)}
            {lb.connected && lb.pending > 0 ? ` · ${s.pending(lb.pending)}` : ''}
            {lb.problem && <InfoTip text={s.serviceSaid(lb.problem)} label="ListenBrainz" />}
          </span>
        </span>
        {lb.connected && !lb.problem ? (
          <button type="button" className="btn-quiet btn-small" disabled={busy} onClick={() => disconnect('listenbrainz')}>{s.disconnect}</button>
        ) : (
          <button type="button" className="btn-tinted btn-small" disabled={busy} onClick={() => setTokenOpen((o) => !o)} aria-expanded={tokenOpen}>{s.connect}</button>
        )}
      </div>
      {tokenOpen && (
        <div className="scrobble-token">
          <span className="field">
            <input
              className="field-input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={s.token}
              aria-label={s.token}
              value={token}
              autoFocus
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendToken()}
            />
          </span>
          <button type="button" className="btn-tinted btn-small" disabled={busy || !token.trim()} onClick={sendToken}>{s.save}</button>
          <p className="setting-hint">{s.tokenHint}</p>
        </div>
      )}
      <div className="scrobble-row">
        <span className="scrobble-text">
          <span className="scrobble-name">Last.fm</span>
          <span className={'scrobble-state' + (lf.problem ? ' is-warning' : '')}>
            {lastfmOff ? s.lastfmUnavailableShort : line(lf)}
            {lf.connected && lf.pending > 0 ? ` · ${s.pending(lf.pending)}` : ''}
            {lf.problem && <InfoTip text={s.serviceSaid(lf.problem)} label="Last.fm" />}
          </span>
        </span>
        {lastfmOff ? null : lf.connected && !lf.problem ? (
          <button type="button" className="btn-quiet btn-small" disabled={busy} onClick={() => disconnect('lastfm')}>{s.disconnect}</button>
        ) : (
          <button type="button" className="btn-tinted btn-small" disabled={busy} onClick={connectLastfm}>{s.connect}</button>
        )}
      </div>
      {lastfmPending && <p className="setting-hint">{s.lastfmWaiting}</p>}
      {error && <p className="setting-hint is-warning" role="alert">{error}</p>}
    </div>
  );
}

/**
 * Length or time left at the end of the progress bar: the examples are the song playing now
 * (the time left moves as it plays), else 3:45 and -1:21.
 */
function TimeChoice() {
  const showRemaining = useShowRemaining();
  const { current } = usePlayer();
  const { duration, position: remote } = useTransport();
  const local = usePosition();
  const live = current != null && duration > 0;
  const position = remote ?? local;
  const total = live ? formatTime(duration) : '3:45';
  const left = live ? `-${formatTime(Math.max(0, duration - position))}` : '-1:21';
  return (
    <>
      <span id="setting-time">{t.timeShown}</span>
      <div className="chips" role="radiogroup" aria-labelledby="setting-time">
        <button type="button" role="radio" aria-checked={!showRemaining} className={'chip' + (!showRemaining ? ' is-on' : '')} onClick={() => setShowRemaining(false)}>
          {t.timeTotal(total)}
        </button>
        <button type="button" role="radio" aria-checked={showRemaining} className={'chip time-chip' + (showRemaining ? ' is-on' : '')} onClick={() => setShowRemaining(true)}>
          {t.timeLeft(left)}
        </button>
      </div>
    </>
  );
}

export function SettingsDialog({ onClose }: { onClose: () => void }) {
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
      <div className="dialog settings-dialog" role="dialog" aria-modal="true" aria-label={t.title}>
        <div className="dialog-head">
          <h2 className="dialog-title">{t.title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t.close} title={t.close}>
            <CloseIcon size={18} />
          </button>
        </div>
        {/* Two columns on a computer: everyday settings on the left, the account's links on the right. */}
        <div className="settings-grid">
        <div className="settings-col">
        <div className="setting">
          <span className="setting-label">{t.player}</span>
          <span className="label-with-info">{t.crossfade} <InfoTip text={t.crossfadeHint} label={t.crossfade} /></span>
          <div className="setting-slider">
            <Slider value={crossfade} max={MAX_CROSSFADE} step={1} label={t.crossfade} valueText={crossfadeText} onChange={setCrossfade} />
            <span className="setting-value" aria-hidden="true">{crossfadeText}</span>
          </div>
          <TimeChoice />
        </div>
        <div className="setting">
          <span className="setting-label label-with-info"><span id="setting-language">{t.language}</span> <InfoTip text={t.languageHint} label={t.language} /></span>
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
        </div>
        </div>
        <div className="settings-col">
        <ConnectSettings />
        <ScrobblingSettings />
        </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
