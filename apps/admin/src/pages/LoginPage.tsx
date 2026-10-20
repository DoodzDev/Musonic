/**
 * @file LoginPage.tsx
 * @description Signing in to the console, and the page for accounts that are not
 *   administrators (they listen with Musonic Web or an app, same address).
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@musonic/icons';
import { api, ApiError, session } from '../api.ts';
import { ErrorLine } from '../components/ui.tsx';
import { t } from '../i18n/index.ts';

export function LoginPage({ onSignedIn }: { onSignedIn: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ token: string; user: { is_admin: boolean } }>('/v1/auth/login', { method: 'POST', body: { username, password, client: 'Musonic Console' }, auth: false });
      session.set(r.token);
      onSignedIn();
      navigate(r.user.is_admin ? '/' : '/not-admin', { replace: true });
    } catch (err) {
      const e = err as Error;
      setError(err instanceof ApiError && err.status === 401 ? t.login.wrong : err instanceof ApiError && err.status === 403 ? t.login.suspended : e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="public">
      <form className="box" onSubmit={submit}>
        <div className="logo"><Icon name="logo" size={64} /></div>
        <h1>{t.login.title}</h1>
        <p className="sub muted">{t.login.sub}</p>
        <div className="field"><label htmlFor="u">{t.login.name}</label><input id="u" className="input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} /></div>
        <div className="field"><label htmlFor="p">{t.login.password}</label><input id="p" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <button className="btn primary block" disabled={busy || !username || !password}>{t.login.signIn}</button>
        <ErrorLine error={error} />
        <p className="muted small" style={{ textAlign: 'center', marginTop: 18 }}>
          {t.login.listen(location.host)}
        </p>
      </form>
    </div>
  );
}

export function NotAdminPage({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="public">
      <div className="box" style={{ textAlign: 'center' }}>
        <div className="logo"><Icon name="logo" size={64} /></div>
        <h1>{t.login.notAdmin}</h1>
        <p className="sub muted">{t.login.notAdminSub}</p>
        <a className="btn primary block" href="https://doodzprog.github.io/Musonic/app/">{t.login.openWeb}</a>
        <a className="btn ghost block" href="/login" style={{ marginTop: 8 }} onClick={onSignOut}>{t.login.switchAccount}</a>
      </div>
    </div>
  );
}
