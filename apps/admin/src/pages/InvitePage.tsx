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
import { t } from '../i18n/index.ts';
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
      setError((err as Error).message.includes('taken') ? t.invite.taken : (err as Error).message);
    }
  }

  if (done) {
    return (
      <PublicBox>
        <h1>{t.invite.ready}</h1>
        <p className="sub muted">{t.invite.addServer}</p>
        <div className="linkbox" style={{ justifyContent: 'center' }}>https://{location.host}</div>
        <p className="muted small mt" style={{ textAlign: 'center' }}>{t.invite.thenSignIn}</p>
      </PublicBox>
    );
  }
  return (
    <PublicBox>
      <h1>{t.invite.welcome}</h1>
      {blocked ? <p className="sub muted">{blocked}</p> : (
        <form onSubmit={submit}>
          <p className="sub muted">{info?.name ? t.invite.by(info.name) : t.invite.anonymous} {t.invite.choose}</p>
          <div className="field"><label htmlFor="name">{t.invite.name}</label><input id="name" className="input" autoComplete="username" placeholder={t.invite.nameHint} value={username} onChange={(e) => setUsername(e.target.value)} /></div>
          <PasswordFields password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} />
          <button className="btn primary block" disabled={!info || !username.trim()}>{t.invite.create}</button>
          <ErrorLine error={error} />
          {info?.expiresAt && <p className="muted small" style={{ textAlign: 'center', marginTop: 18 }}>{t.invite.validUntil(date(info.expiresAt))}</p>}
        </form>
      )}
    </PublicBox>
  );
}
