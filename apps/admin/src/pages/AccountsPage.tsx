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
import { t } from '../i18n/index.ts';
import { ErrorLine } from '../components/ui.tsx';
import { InviteModal } from '../components/InviteModal.tsx';

function invitationState(i: Invitation): [string, string] {
  if (i.accountDeleted) return ['', t.accounts.usedDeleted(i.usedBy ?? '?')];
  if (i.usedBy) return ['ok', t.accounts.usedBy(i.usedBy)];
  if (i.revokedAt) return ['bad', t.accounts.revoked];
  if (i.expiresAt * 1000 < Date.now()) return ['bad', t.accounts.expired];
  return ['wait', t.accounts.pending];
}

function quota(a: Account): string {
  const max = a.limits.importsPerMonth;
  if (a.isAdmin) return `${a.importsThisMonth}`;
  return t.accounts.of(a.importsThisMonth, max == null ? t.common.unlimited.toLowerCase() : String(max));
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
        <div><h1>{t.accounts.title}</h1><p className="sub">{accounts ? t.accounts.summary(accounts.length, admins) : '…'}</p></div>
        <div className="row">
          <label className="search"><Icon name="search" size={16} /><input placeholder={t.accounts.search} value={filter} onChange={(e) => setFilter(e.target.value)} /></label>
          <button className="btn primary" onClick={() => setInviting(true)}><Icon name="plus" size={16} /> {t.accounts.invite}</button>
        </div>
      </div>
      <ErrorLine error={error} />

      <div className="card" style={{ padding: '8px 6px' }}>
        <table>
          <thead><tr><th>{t.accounts.account}</th><th>{t.accounts.role}</th><th>{t.accounts.lastLogin}</th><th>{t.accounts.devices}</th><th>{t.accounts.importsMonth}</th><th /></tr></thead>
          <tbody>
            {shown.map((a) => (
              <tr key={a.id} className="click" onClick={() => navigate(`/accounts/${a.id}`)}>
                <td><div className="row"><div className="avatar">{a.username.slice(0, 1).toUpperCase()}</div><b>{a.username}</b>{a.suspended && <span className="tag wait">{t.accounts.suspended}</span>}</div></td>
                <td><span className={'tag' + (a.isAdmin ? ' accent' : '')}>{a.isAdmin ? t.common.admin : t.common.user}</span></td>
                <td>{relative(a.lastLoginAt)}</td>
                <td>{a.devices}</td>
                <td>{quota(a)}</td>
                <td className="muted"><Icon name="chevron-right" size={16} /></td>
              </tr>
            ))}
            {accounts && shown.length === 0 && <tr><td colSpan={6} className="empty">{t.accounts.noMatch}</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="section-title">
        <h2>{t.accounts.invitations}</h2>
        <button className="btn sm" onClick={() => setInviting(true)}><Icon name="plus" size={14} /> {t.accounts.newInvitation}</button>
      </div>
      <div className="card" style={{ padding: '8px 6px' }}>
        <table>
          <thead><tr><th>{t.accounts.for}</th><th>{t.accounts.role}</th><th>{t.accounts.created}</th><th>{t.accounts.expires}</th><th>{t.accounts.state}</th><th /></tr></thead>
          <tbody>
            {invitations.map((i) => {
              const [kind, label] = invitationState(i);
              const pending = kind === 'wait';
              return (
                <tr key={i.id}>
                  <td>{i.note || <span className="muted">{t.accounts.noNote}</span>}</td>
                  <td>{i.isAdmin ? t.common.admin : t.common.user}</td>
                  <td>{relative(i.createdAt)}</td>
                  <td>{i.usedAt || i.revokedAt ? '—' : relative(i.expiresAt)}</td>
                  <td><span className={`tag ${kind}`}>{label}</span></td>
                  <td>{pending && <button className="btn sm danger" onClick={() => act(api(`/v1/invitations/${i.id}`, { method: 'DELETE' }))}>{t.common.cancel}</button>}</td>
                </tr>
              );
            })}
            {invitations.length === 0 && <tr><td colSpan={6} className="empty">{t.accounts.noInvitations}</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="note mt-s">{t.accounts.linkOnce}</p>

      <div className="section-title"><h2>{t.accounts.resets}</h2></div>
      <div className="card">
        {resets.map((r) => (
          <div key={r.id} className="list-item">
            <div className="avatar">{r.username.slice(0, 1).toUpperCase()}</div>
            <div><b className="small">{r.username}</b><div className="muted small">{t.accounts.resetLine(relative(r.createdAt), relative(r.expiresAt))}</div></div>
            <button className="btn sm danger" style={{ marginLeft: 'auto' }} onClick={() => act(api(`/v1/password-resets/${r.id}`, { method: 'DELETE' }))}>{t.common.cancel}</button>
          </div>
        ))}
        {resets.length === 0 && <p className="empty" style={{ padding: 0 }}>{t.accounts.noResets}</p>}
      </div>

      {inviting && <InviteModal onClose={() => setInviting(false)} onCreated={load} />}
    </>
  );
}

