/**
 * @file LoginScreen.tsx
 * @description Server login form. Checks the credentials with a ping before opening the app.
 * @author DoodzProg
 * @version 0.3.0
 * @license CC-BY-NC-4.0
 */

import { useState, type FormEvent } from 'react';
import { createSession, SubsonicClient, SubsonicError, type SubsonicSession } from '@musonic/core';
import { fr } from '../i18n/fr.ts';
import { loadLastServer, transportSession } from '../lib/session.ts';
import { EyeIcon, WarningIcon } from './Icons.tsx';
import { Logo } from './Logo.tsx';

interface Props {
  onLogin: (session: SubsonicSession) => void;
}

const t = fr.login;

export function LoginScreen({ onLogin }: Props) {
  const [server, setServer] = useState(loadLastServer);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const session = createSession(address, username, password);
    try {
      await new SubsonicClient(transportSession(session)).ping();
      setPassword('');
      onLogin(session);
    } catch (e) {
      if (e instanceof SubsonicError && e.isAuthError) setError(t.errors.auth);
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
          <Logo size={64} />
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
          {error && (
            <p className="form-error" role="alert">
              <WarningIcon /> {error}
            </p>
          )}
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? t.submitting : t.submit}
          </button>
          <p className="footnote">{t.footnote}</p>
        </form>
      </div>
    </div>
  );
}
