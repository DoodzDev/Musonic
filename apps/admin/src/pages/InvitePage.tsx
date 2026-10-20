/**
 * @file InvitePage.tsx
 * @description Public page of an invitation link: the person creates their account (name,
 *   password, confirmation). The administrator never sees the password.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { api } from '../api.ts';
import { date } from '../format.ts';
import { ErrorLine } from '../components/ui.tsx';
import { PasswordFields, PublicBox } from './LinkPage.tsx';
import { passwordProblem, useLink } from './links.ts';

export function InvitePage() {
  const { token = '' } = useParams();
  const { info, blocked } = useLink(`/v1/invite/${encodeURIComponent(token)}`);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = passwordProblem(password, confirm);
    if (problem) return setError(problem);
    try {
      await api(`/v1/invite/${encodeURIComponent(token)}`, { method: 'POST', body: { username, password }, auth: false });
      setDone(true);
    } catch (err) {
      setError((err as Error).message.includes('taken') ? 'Ce nom est déjà pris, choisissez-en un autre.' : (err as Error).message);
    }
  }

  if (done) {
    return (
      <PublicBox>
        <h1>Votre compte est prêt</h1>
        <p className="sub muted">Dans l'application Musonic (ou Substreamer, Symfonium…), ajoutez le serveur :</p>
        <div className="linkbox" style={{ justifyContent: 'center' }}>https://{location.host}</div>
        <p className="muted small mt" style={{ textAlign: 'center' }}>et connectez-vous avec le nom et le mot de passe que vous venez de choisir.</p>
      </PublicBox>
    );
  }
  return (
    <PublicBox>
      <h1>Bienvenue sur Musonic</h1>
      {blocked ? <p className="sub muted">{blocked}</p> : (
        <form onSubmit={submit}>
          <p className="sub muted">{info?.name ? `${info.name} vous invite.` : 'Vous êtes invité.'} Choisissez votre nom et votre mot de passe.</p>
          <div className="field"><label htmlFor="name">Nom</label><input id="name" className="input" autoComplete="username" placeholder="Votre nom, pour vous connecter" value={username} onChange={(e) => setUsername(e.target.value)} /></div>
          <PasswordFields password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} />
          <button className="btn primary block" disabled={!info || !username.trim()}>Créer mon compte</button>
          <ErrorLine error={error} />
          {info?.expiresAt && <p className="muted small" style={{ textAlign: 'center', marginTop: 18 }}>Lien valable jusqu'au {date(info.expiresAt)}, une seule fois.</p>}
        </form>
      )}
    </PublicBox>
  );
}
