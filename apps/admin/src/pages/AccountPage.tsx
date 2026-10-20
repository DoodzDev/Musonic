/**
 * @file AccountPage.tsx
 * @description One account: role, suspension, rights and quotas (users who are not
 *   administrators; everything allowed by default), device keys, password reset link,
 *   deletion. No password is ever shown or chosen here.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Icon } from '@musonic/icons';
import type { AccountDetail, Limits, PasswordReset } from '@musonic/core';
import type { Me } from '../App.tsx';
import { useAutoRefresh } from '../refresh.ts';
import { api, linkUrl } from '../api.ts';
import { date, relative } from '../format.ts';
import { t } from '../i18n/index.ts';
import { Duration } from '../components/Duration.tsx';
import { CopyLink, ErrorLine, Modal, Seg, Toggle } from '../components/ui.tsx';

type QuotaKey = 'importsPerDay' | 'importsPerMonth' | 'importBytesMax' | 'maxBitRate';

const a_ = t.account;
const QUOTAS: { key: QuotaKey; label: string; presets: [number, string][]; unit: string; scale: number }[] = [
  { key: 'importsPerDay', label: a_.importsPerDay, presets: [[10, '10'], [50, '50']], unit: a_.unitImports, scale: 1 },
  { key: 'importsPerMonth', label: a_.importsPerMonth, presets: [[100, '100'], [500, '500']], unit: a_.unitImports, scale: 1 },
  { key: 'importBytesMax', label: a_.importBytesMax, presets: [[1, `1 ${a_.unitGb}`], [5, `5 ${a_.unitGb}`]], unit: a_.unitGb, scale: 1e9 },
  { key: 'maxBitRate', label: a_.maxBitRate, presets: [[320, '320 kbit/s'], [192, '192 kbit/s'], [128, '128 kbit/s']], unit: a_.unitKbps, scale: 1 },
];

function QuotaField({ q, value, onChange }: { q: (typeof QUOTAS)[number]; value: number | null; onChange: (v: number | null) => void }) {
  const shown = value == null ? null : Math.round(value / q.scale);
  const preset = shown == null ? 'none' : q.presets.some(([p]) => p === shown) ? String(shown) : 'custom';
  const [custom, setCustom] = useState(preset === 'custom');
  return (
    <div className="field">
      <label>{q.label}</label>
      <select
        className="input"
        value={custom ? 'custom' : preset}
        onChange={(e) => {
          const v = e.target.value;
          setCustom(v === 'custom');
          if (v === 'none') onChange(null);
          else if (v !== 'custom') onChange(Number(v) * q.scale);
        }}
      >
        <option value="none">{q.key === 'maxBitRate' ? t.common.noLimit : t.common.unlimited}</option>
        {q.presets.map(([p, l]) => <option key={p} value={p}>{l}</option>)}
        <option value="custom">{t.common.customValue}</option>
      </select>
      {custom && (
        <div className="row">
          <input className="input" type="number" min={1} style={{ width: 120 }} value={shown ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) * q.scale : null)} />
          <span className="muted small">{q.unit}</span>
        </div>
      )}
    </div>
  );
}

export function AccountPage({ me }: { me: Me | null }) {
  const { id = '' } = useParams();
  const [d, setD] = useState<AccountDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [modal, setModal] = useState<'reset' | 'delete' | null>(null);
  const navigate = useNavigate();

  const load = useCallback(() => {
    api<AccountDetail>(`/v1/users/${id}`).then(setD).catch((e: Error) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);
  useAutoRefresh(load);
  if (!d) return <ErrorLine error={error} />;
  const a = d.account;
  const isMe = a.id === me?.id;

  const run = (p: Promise<unknown>) => {
    setError(null);
    return p.then(load).catch((e: Error) => setError(e.message.includes('administrator') ? t.account.lastAdmin : e.message));
  };
  const patch = (body: object) => run(api(`/v1/users/${id}`, { method: 'PATCH', body }));
  const setLimits = (changes: Partial<Limits>) => {
    setSaved(false);
    void run(api(`/v1/users/${id}/limits`, { method: 'PUT', body: { ...a.limits, ...changes } }).then(() => setSaved(true)));
  };
  const rights: [keyof Limits, string, string][] = (['canImport', 'canOnline', 'canDownload', 'canPublicPlaylists'] as const).map(
    (k) => [k, t.account[k][0], t.account[k][1]],
  );

  return (
    <>
      <Link className="btn ghost sm" to="/accounts"><Icon name="back-arrow" size={14} /> {t.account.back}</Link>
      <div className="head mt-s">
        <div className="row">
          <div className="avatar" style={{ width: 56, height: 56, fontSize: 22 }}>{a.username.slice(0, 1).toUpperCase()}</div>
          <div><h1>{a.username}{isMe && <span className="muted small" style={{ marginLeft: 8 }}>{t.common.you}</span>}</h1><p className="sub">{t.account.summary(a.isAdmin ? t.common.admin : t.common.user, date(a.createdAt), relative(a.lastLoginAt).toLowerCase())}</p></div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setModal('reset')}>{t.account.resetLink}</button>
          {!isMe && <button className="btn danger" onClick={() => setModal('delete')}><Icon name="trash" size={14} /> {t.account.delete}</button>}
        </div>
      </div>
      <ErrorLine error={error} />

      <div className="grid g2">
        <div className="card">
          <h2>{t.account.role}</h2>
          <Seg value={a.isAdmin ? 'admin' : 'user'} options={[['user', t.common.user], ['admin', t.common.admin]]} onChange={(v) => patch({ isAdmin: v === 'admin' })} />
          <p className="muted small mt-s">{t.account.roleHelp}</p>
          <h2 className="mt">{t.account.account}</h2>
          <div className="setting"><div><b>{t.account.active}</b><p>{t.account.activeHelp}</p></div><Toggle label={t.account.active} on={!a.suspended} onChange={(on) => patch({ suspended: !on })} /></div>
          <div className="setting"><div><b>{t.account.logout}</b><p>{t.account.logoutHelp}</p></div><button className="btn sm" onClick={() => run(api(`/v1/users/${id}/logout`, { method: 'POST' }))}>{t.account.logoutButton}</button></div>
        </div>
        <div className="card">
          <h2>{t.account.rights}</h2>
          {a.isAdmin ? (
            <p className="muted small">{t.account.adminsUnlimited}</p>
          ) : (
            rights.map(([key, title, desc]) => (
              <div key={key} className="setting"><div><b>{title}</b><p>{desc}</p></div><Toggle label={title} on={Boolean(a.limits[key])} onChange={(on) => setLimits({ [key]: on })} /></div>
            ))
          )}
        </div>
        {!a.isAdmin && (
          <div className="card" style={{ gridColumn: '1/-1' }}>
            <div className="spread"><h2 style={{ margin: 0 }}>{t.account.quotas}</h2><span className="muted small">{saved ? t.account.saved : t.account.defaultUnlimited}</span></div>
            <div className="grid g4 mt-s">
              {QUOTAS.map((q) => <QuotaField key={q.key} q={q} value={(a.limits[q.key] as number | null) ?? null} onChange={(v) => setLimits({ [q.key]: v })} />)}
            </div>
            <div className="small muted">{t.account.thisMonth(a.importsThisMonth)}</div>
          </div>
        )}
        <div className="card" style={{ gridColumn: '1/-1' }}>
          <h2>{t.account.devices}</h2>
          {d.apiKeys.map((k) => (
            <div key={k.id} className="list-item">
              <Icon name="phone" size={18} />
              <div><b className="small">{k.name}</b><div className="muted small">{t.account.keyLine(relative(k.created_at), relative(k.last_used_at).toLowerCase())}</div></div>
              <button className="btn sm danger" style={{ marginLeft: 'auto' }} onClick={() => run(api(`/v1/users/${id}/api-keys/${k.id}`, { method: 'DELETE' }))}>{t.account.revoke}</button>
            </div>
          ))}
          {d.apiKeys.length === 0 && <p className="muted small">{t.account.noKeys}</p>}
        </div>
      </div>

      {modal === 'reset' && <ResetModal username={a.username} id={a.id} onClose={() => { setModal(null); load(); }} />}
      {modal === 'delete' && <DeleteModal username={a.username} onClose={() => setModal(null)} onDelete={() => api(`/v1/users/${id}`, { method: 'DELETE' }).then(() => navigate('/accounts'))} />}
    </>
  );
}

function ResetModal({ username, id, onClose }: { username: string; id: string; onClose: () => void }) {
  const [seconds, setSeconds] = useState(86400);
  const [logout, setLogout] = useState(true);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function create() {
    try {
      const r = await api<{ reset: PasswordReset; token: string }>(`/v1/users/${id}/password-reset`, { method: 'POST', body: { seconds, logoutDevices: logout } });
      setLink(linkUrl('reset', r.token));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal title={t.account.resetTitle(username)} onClose={onClose}>
      <p className="muted small">{t.account.resetSub}</p>
      {link ? (
        <>
          <CopyLink url={link} />
          <div className="actions"><button className="btn primary" onClick={onClose}>{t.common.done}</button></div>
        </>
      ) : (
        <>
          <div className="field"><label>{t.inviteModal.valid}</label><Duration seconds={seconds} onChange={setSeconds} /></div>
          <div className="setting"><div><b>{t.account.resetDevices}</b><p>{t.account.resetDevicesHelp}</p></div><Toggle label={t.account.resetDevices} on={logout} onChange={setLogout} /></div>
          <ErrorLine error={error} />
          <div className="actions"><button className="btn ghost" onClick={onClose}>{t.common.cancel}</button><button className="btn primary" onClick={create}>{t.account.createLink}</button></div>
        </>
      )}
    </Modal>
  );
}

function DeleteModal({ username, onClose, onDelete }: { username: string; onClose: () => void; onDelete: () => Promise<unknown> }) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title={t.account.deleteTitle(username)} onClose={onClose}>
      <p className="muted small">{t.account.deleteSub}</p>
      <div className="field"><label>{t.account.typeToConfirm(username)}</label><input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} /></div>
      <ErrorLine error={error} />
      <div className="actions">
        <button className="btn ghost" onClick={onClose}>{t.common.cancel}</button>
        <button className="btn danger" disabled={typed !== username} onClick={() => onDelete().catch((e: Error) => setError(e.message))}>{t.account.deleteForever}</button>
      </div>
    </Modal>
  );
}
