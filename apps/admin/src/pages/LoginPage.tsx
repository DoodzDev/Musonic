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
      const r = await api<{ token: string; user: { is_admin: boolean } }>('/v1/auth/login', { method: 'POST', body: { username, password }, auth: false });
      session.set(r.token);
      onSignedIn();
      navigate(r.user.is_admin ? '/' : '/not-admin', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? 'Nom ou mot de passe incorrect.' : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="public">
      <form className="box" onSubmit={submit}>
        <div className="logo"><Icon name="logo" size={64} /></div>
        <h1>Console Musonic</h1>
        <p className="sub muted">Réservée aux administrateurs de ce serveur.</p>
        <div className="field"><label htmlFor="u">Nom</label><input id="u" className="input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} /></div>
        <div className="field"><label htmlFor="p">Mot de passe</label><input id="p" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <button className="btn primary block" disabled={busy || !username || !password}>Se connecter</button>
        <ErrorLine error={error} />
        <p className="muted small" style={{ textAlign: 'center', marginTop: 18 }}>
          Pour écouter, utilisez Musonic Web ou l'application, avec l'adresse <b>{location.host}</b>.
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
        <h1>Vous n'êtes pas administrateur</h1>
        <p className="sub muted">Ce compte peut écouter de la musique, mais pas gérer le serveur.</p>
        <a className="btn primary block" href="https://doodzprog.github.io/Musonic/app/">Ouvrir Musonic Web</a>
        <a className="btn ghost block" href="/login" style={{ marginTop: 8 }} onClick={onSignOut}>Changer de compte</a>
      </div>
    </div>
  );
}
