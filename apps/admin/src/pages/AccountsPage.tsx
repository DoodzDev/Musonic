/**
 * @file AccountsPage.tsx
 * @description Accounts, in one place: existing accounts, invitation links, password reset
 *   links in progress. Accounts are created by invitation only: the administrator never
 *   sees a password.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@musonic/icons';
import type { Account, Invitation, PasswordReset } from '@musonic/core';
import { useAutoRefresh } from '../refresh.ts';
import { api } from '../api.ts';
import { relative } from '../format.ts';
import { ErrorLine } from '../components/ui.tsx';
import { InviteModal } from '../components/InviteModal.tsx';

function invitationState(i: Invitation): [string, string] {
  if (i.usedBy) return ['ok', `Utilisée par ${i.usedBy}`];
  if (i.revokedAt) return ['bad', 'Annulée'];
  if (i.expiresAt * 1000 < Date.now()) return ['bad', 'Expirée'];
  return ['wait', 'En attente'];
}

function quota(a: Account): string {
  const max = a.limits.importsPerMonth;
  if (a.isAdmin) return `${a.importsThisMonth}`;
  return max == null ? `${a.importsThisMonth} / illimité` : `${a.importsThisMonth} / ${max}`;
}

export function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [resets, setResets] = useState<PasswordReset[]>([]);
  const [inviting, setInviting] = useState(false);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = useCallback(() => {
    Promise.all([api<Account[]>('/v1/users'), api<Invitation[]>('/v1/invitations'), api<PasswordReset[]>('/v1/password-resets')])
      .then(([a, i, r]) => {
        setAccounts(a);
        setInvitations(i);
        setResets(r);
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  useAutoRefresh(load);

  const act = (p: Promise<unknown>) => p.then(load).catch((e: Error) => setError(e.message));
  const shown = (accounts ?? []).filter((a) => a.username.toLowerCase().includes(filter.toLowerCase()));
  const admins = (accounts ?? []).filter((a) => a.isAdmin).length;

  return (
    <>
      <div className="head">
        <div><h1>Comptes</h1><p className="sub">{accounts ? `${accounts.length} comptes · ${admins} administrateur${admins > 1 ? 's' : ''}` : '…'}</p></div>
        <div className="row">
          <label className="search"><Icon name="search" size={16} /><input placeholder="Rechercher un compte" value={filter} onChange={(e) => setFilter(e.target.value)} /></label>
          <button className="btn primary" onClick={() => setInviting(true)}><Icon name="plus" size={16} /> Inviter quelqu'un</button>
        </div>
      </div>
      <ErrorLine error={error} />

      <div className="card" style={{ padding: '8px 6px' }}>
        <table>
          <thead><tr><th>Compte</th><th>Rôle</th><th>Dernière connexion</th><th>Appareils</th><th>Imports (ce mois)</th><th /></tr></thead>
          <tbody>
            {shown.map((a) => (
              <tr key={a.id} className="click" onClick={() => navigate(`/accounts/${a.id}`)}>
                <td><div className="row"><div className="avatar">{a.username.slice(0, 1).toUpperCase()}</div><b>{a.username}</b>{a.suspended && <span className="tag wait">Suspendu</span>}</div></td>
                <td><span className={'tag' + (a.isAdmin ? ' accent' : '')}>{a.isAdmin ? 'Administrateur' : 'Utilisateur'}</span></td>
                <td>{relative(a.lastLoginAt)}</td>
                <td>{a.devices}</td>
                <td>{quota(a)}</td>
                <td className="muted"><Icon name="chevron-right" size={16} /></td>
              </tr>
            ))}
            {accounts && shown.length === 0 && <tr><td colSpan={6} className="empty">Aucun compte ne correspond.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="section-title">
        <h2>Invitations</h2>
        <button className="btn sm" onClick={() => setInviting(true)}><Icon name="plus" size={14} /> Nouvelle invitation</button>
      </div>
      <div className="card" style={{ padding: '8px 6px' }}>
        <table>
          <thead><tr><th>Pour</th><th>Rôle</th><th>Créée</th><th>Expire</th><th>État</th><th /></tr></thead>
          <tbody>
            {invitations.map((i) => {
              const [kind, label] = invitationState(i);
              const pending = kind === 'wait';
              return (
                <tr key={i.id}>
                  <td>{i.note || <span className="muted">Sans note</span>}</td>
                  <td>{i.isAdmin ? 'Administrateur' : 'Utilisateur'}</td>
                  <td>{relative(i.createdAt)}</td>
                  <td>{i.usedAt || i.revokedAt ? '—' : relative(i.expiresAt)}</td>
                  <td><span className={`tag ${kind}`}>{label}</span></td>
                  <td>{pending && <button className="btn sm danger" onClick={() => act(api(`/v1/invitations/${i.id}`, { method: 'DELETE' }))}>Annuler</button>}</td>
                </tr>
              );
            })}
            {invitations.length === 0 && <tr><td colSpan={6} className="empty">Aucune invitation pour l'instant.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="note mt-s">Le lien d'une invitation n'est montré qu'à sa création. S'il est perdu, annulez l'invitation et créez-en une nouvelle.</p>

      <div className="section-title"><h2>Réinitialisations de mot de passe en cours</h2></div>
      <div className="card">
        {resets.map((r) => (
          <div key={r.id} className="list-item">
            <div className="avatar">{r.username.slice(0, 1).toUpperCase()}</div>
            <div><b className="small">{r.username}</b><div className="muted small">Lien créé {relative(r.createdAt)} · expire {relative(r.expiresAt)} · usage unique</div></div>
            <button className="btn sm danger" style={{ marginLeft: 'auto' }} onClick={() => act(api(`/v1/password-resets/${r.id}`, { method: 'DELETE' }))}>Annuler</button>
          </div>
        ))}
        {resets.length === 0 && <p className="empty" style={{ padding: 0 }}>Aucune. Ouvrez un compte pour lui envoyer un lien.</p>}
      </div>

      {inviting && <InviteModal onClose={() => setInviting(false)} onCreated={load} />}
    </>
  );
}

