/**
 * @file ResetPage.tsx
 * @description Public page of a password reset link: the person chooses a new password.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { api } from '../api.ts';
import { ErrorLine } from '../components/ui.tsx';
import { PasswordFields, PublicBox } from './LinkPage.tsx';
import { passwordProblem, useLink } from './links.ts';

export function ResetPage() {
  const { token = '' } = useParams();
  const { info, blocked } = useLink(`/v1/reset/${encodeURIComponent(token)}`);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = passwordProblem(password, confirm);
    if (problem) return setError(problem);
    try {
      await api(`/v1/reset/${encodeURIComponent(token)}`, { method: 'POST', body: { password }, auth: false });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <PublicBox>
      <h1>{done ? 'Mot de passe changé' : 'Nouveau mot de passe'}</h1>
      {done ? (
        <p className="sub muted">Reconnectez-vous dans vos applications avec ce nouveau mot de passe.</p>
      ) : (
        blocked ? <p className="sub muted">{blocked}</p> : (
          <form onSubmit={submit}>
            <p className="sub muted">Pour le compte <b>{info?.name ?? '…'}</b>.</p>
            <PasswordFields password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} />
            <button className="btn primary block" disabled={!info}>Enregistrer</button>
            <ErrorLine error={error} />
            <p className="muted small" style={{ textAlign: 'center', marginTop: 18 }}>Vos appareils devront peut-être se reconnecter.</p>
          </form>
        )
      )}
    </PublicBox>
  );
}
