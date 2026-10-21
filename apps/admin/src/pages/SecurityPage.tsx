/**
 * @file SecurityPage.tsx
 * @description « Appareils et sécurité »: the device keys of every account (revoke a lost
 *   phone), the last sign-ins, the addresses the sign-in limiter refuses now (unblock), the
 *   legacy Subsonic sign-in setting.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Icon } from '@musonic/icons';
import type { Blocked, Device, Devices } from '@musonic/core';
import { useAutoRefresh } from '../refresh.ts';
import { api } from '../api.ts';
import { relative } from '../format.ts';
import { t } from '../i18n/index.ts';
import { useServerSettings } from '../serverSettings.ts';
import { ErrorLine, Modal, Toggle } from '../components/ui.tsx';
import { RestartNote } from '../components/Restart.tsx';

export function SecurityPage() {
  const [devices, setDevices] = useState<Devices | null>(null);
  const [blocked, setBlocked] = useState<Blocked[]>([]);
  const [revoking, setRevoking] = useState<Device | null>(null);
  const [legacyOff, setLegacyOff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settings = useServerSettings();

  const load = useCallback(() => {
    Promise.all([api<Devices>('/v1/admin/devices'), api<Blocked[]>('/v1/admin/blocked')])
      .then(([d, b]) => {
        setDevices(d);
        setBlocked(b);
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  useAutoRefresh(load);

  const act = (p: Promise<unknown>) => {
    setError(null);
    return p.then(load).catch((e: Error) => setError(e.message));
  };
  const legacy = settings.value('legacy_auth') === true;

  return (
    <>
      <div className="head"><div><h1>{t.security.title}</h1><p className="sub">{t.security.sub}</p></div></div>
      <RestartNote needed={settings.restartNeeded} />
      <ErrorLine error={error ?? settings.error} />

      <div className="card" style={{ padding: '8px 6px' }}>
        <table>
          <thead><tr><th>{t.security.device}</th><th>{t.security.account}</th><th className="hide-s">{t.security.created}</th><th>{t.security.lastUsed}</th><th /></tr></thead>
          <tbody>
            {devices?.devices.map((d) => (
              <tr key={d.id}>
                <td><div className="row"><Icon name="phone" size={16} /><b>{d.name}</b></div></td>
                <td><Link className="text-link" to={`/accounts/${d.userId}`}>{d.username}</Link></td>
                <td className="hide-s">{relative(d.createdAt)}</td>
                <td>{relative(d.lastUsedAt)}</td>
                <td style={{ textAlign: 'right' }}><button className="btn sm danger" onClick={() => setRevoking(d)}>{t.security.revoke}</button></td>
              </tr>
            ))}
            {devices && devices.devices.length === 0 && <tr><td colSpan={5} className="empty">{t.security.noDevices}</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="grid g2 mt">
        <div className="card">
          <div className="spread"><h2 style={{ margin: 0 }}>{t.security.signIns}</h2><Link className="btn ghost sm" to="/activity">{t.security.seeAll} <Icon name="chevron-right" size={14} /></Link></div>
          <p className="muted small">{t.security.signInsHelp}</p>
          {devices?.signIns.slice(0, 30).map((s, i) => (
            <div key={i} className="list-item">
              <Icon name="person" size={18} />
              <div className="small">
                <b>{s.username}</b> · {s.device || t.security.unknownApp}{s.ip ? ` · ${s.ip}` : ''}
                <div className="muted">{relative(s.at)}</div>
              </div>
            </div>
          ))}
          {devices && devices.signIns.length === 0 && <p className="muted small">{t.security.noSignIns}</p>}
        </div>
        <div className="card">
          <h2>{t.security.blocked}</h2>
          <p className="muted small">{t.security.blockedHelp}</p>
          {blocked.map((b) => (
            <div key={`${b.addr}/${b.username}`} className="list-item">
              <div className="small">
                <b>{b.addr}</b> · {t.security.blockedLine(b.username, b.tries)}
                <div className="muted">{t.security.freeIn(relative(b.until).toLowerCase())}</div>
              </div>
              <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => act(api(`/v1/admin/blocked?${new URLSearchParams({ addr: b.addr, username: b.username })}`, { method: 'DELETE' }))}>{t.security.unblock}</button>
            </div>
          ))}
          {blocked.length === 0 && <p className="muted small">{t.security.noBlocked}</p>}
          {settings.loaded && (
            <div className="setting mt">
              <div><b>{t.security.legacy[0]}</b><p>{t.security.legacy[1]}</p></div>
              <Toggle label={t.security.legacy[0]} on={legacy} onChange={(on) => (on ? settings.set('legacy_auth', true) : setLegacyOff(true))} />
            </div>
          )}
        </div>
      </div>

      {revoking && (
        <Modal title={t.security.revokeTitle(revoking.name, revoking.username)} onClose={() => setRevoking(null)}>
          <p className="muted small">{t.security.revokeSub}</p>
          <div className="actions">
            <button className="btn ghost" onClick={() => setRevoking(null)}>{t.common.cancel}</button>
            <button className="btn danger" onClick={() => act(api(`/v1/users/${revoking.userId}/api-keys/${revoking.id}`, { method: 'DELETE' })).then(() => setRevoking(null))}>{t.security.revoke}</button>
          </div>
        </Modal>
      )}
      {legacyOff && (
        <Modal title={t.security.legacyOffTitle} onClose={() => setLegacyOff(false)}>
          <p className="muted small">{t.security.legacyOffSub}</p>
          <div className="actions">
            <button className="btn ghost" onClick={() => setLegacyOff(false)}>{t.common.cancel}</button>
            <button className="btn danger" onClick={() => { settings.set('legacy_auth', false); setLegacyOff(false); }}>{t.security.legacyOff}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
