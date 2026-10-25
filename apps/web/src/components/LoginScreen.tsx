/**
 * @file LoginScreen.tsx
 * @description Server login form. Checks the credentials before opening the app: on Musonic
 *   Server the password is traded for a device key of this browser (ADR-021), elsewhere a
 *   ping checks the Subsonic token. "Remember me" keeps the session on this browser, after a
 *   warning about the stored key or token. Says why an account was refused.
 * @author DoodzProg
 * @version 0.5.0
 * @license CC-BY-NC-4.0
 */

import { useState, type FormEvent } from 'react';
import {
  createDeviceKeySession,
  createSession,
  normalizeBaseUrl,
  SubsonicClient,
  SubsonicError,
  type AuthProblemReason,
  type SubsonicSession,
} from '@musonic/core';
import { lang, setLang, tr } from '../i18n/index.ts';
import { isMusonicServer } from '../lib/musonicApi.ts';
import { loadLastServer, transportBaseUrl, transportSession } from '../lib/session.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';
import { EyeIcon } from './Icons.tsx';
import { AlertIcon } from './icons/AlertIcon.tsx';
import { LogoIcon } from './icons/LogoIcon.tsx';

interface Props {
  onLogin: (session: SubsonicSession, remember: boolean) => void;
  /** The account the server refused, and why. */
  refused?: { reason: AuthProblemReason; username: string } | null;
}

const t = tr.login;

/** Name of the key in the console's device list, e.g. "Musonic Web · Firefox (Linux)". */
function deviceName(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return `Musonic Web · ${browser}${os ? ` (${os})` : ''}`;
}

export function LoginScreen({ onLogin, refused }: Props) {
  const [server, setServer] = useState(loadLastServer);
  const [username, setUsername] = useState(refused?.username ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [askRemember, setAskRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(refused ? t.errors[refused.reason] : null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const address = /^https?:\/\//i.test(server.trim()) ? server : `https://${server.trim()}`;
    try {
      new URL(address);
    } catch {
      setError(t.errors.invalidUrl);
      setBusy(false);
      return;
    }
    const plain = createSession(address, username, password);
    try {
      let session = plain;
      if (await isMusonicServer(plain)) {
        session = await createDeviceKeySession(address, username, password, deviceName(), {
          transportUrl: transportBaseUrl(normalizeBaseUrl(address)),
        });
      } else {
        await new SubsonicClient(transportSession(plain)).ping();
      }
      setPassword('');
      onLogin(session, remember);
    } catch (e) {
      if (e instanceof SubsonicError && e.status === 403) setError(t.errors.suspended);
      else if (e instanceof SubsonicError && e.isAuthError) setError(t.errors.auth);
      else if (e instanceof SubsonicError && e.isUnreachable) setError(t.errors.unreachable);
      else setError(t.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-column">
        <div className="login-brand">
          <LogoIcon size={64} />
          <h1>Musonic</h1>
          <p>{t.tagline}</p>
        </div>

        <form className="login-form" onSubmit={submit}>
          <label className="field-label">
            <span>{t.server}</span>
            <span className="field">
              <input
                type="text"
                inputMode="url"
                required
                autoComplete="url"
                spellCheck={false}
                value={server}
                onChange={(e) => setServer(e.target.value)}
                placeholder={t.serverPlaceholder}
              />
            </span>
          </label>
          <label className="field-label">
            <span>{t.username}</span>
            <span className="field">
              <input type="text" required autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t.usernamePlaceholder} />
            </span>
          </label>
          <label className="field-label">
            <span>{t.password}</span>
            <span className="field">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t.passwordPlaceholder}
              />
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? t.hidePassword : t.showPassword}
                aria-pressed={showPassword}
              >
                <EyeIcon />
              </button>
            </span>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => (e.target.checked ? setAskRemember(true) : setRemember(false))}
            />
            <span>{t.remember}</span>
          </label>
          {error && (
            <p className="form-error" role="alert">
              <AlertIcon size={16} triangle /> {error}
            </p>
          )}
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? t.submitting : t.submit}
          </button>
          <p className="footnote">{t.footnote}</p>
          <p className="login-lang">
            <button type="button" lang="en" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>English</button>
            <span aria-hidden="true">·</span>
            <button type="button" lang="fr" aria-pressed={lang === 'fr'} onClick={() => setLang('fr')}>Français</button>
          </p>
        </form>
      </div>
      {askRemember && (
        <ConfirmDialog
          title={t.rememberWarning.title}
          confirm={t.rememberWarning.confirm}
          warning
          onConfirm={() => {
            setRemember(true);
            setAskRemember(false);
          }}
          onClose={() => setAskRemember(false)}>
          <p>{t.rememberWarning.body}</p>
          <p>{t.rememberWarning.advice}</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
