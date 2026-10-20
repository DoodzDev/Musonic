/**
 * @file InviteModal.tsx
 * @description Creating an invitation link. The link is shown once, to copy and send.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useState } from 'react';
import type { Invitation } from '@musonic/core';
import { api, linkUrl } from '../api.ts';
import { Duration } from './Duration.tsx';
import { t } from '../i18n/index.ts';
import { CopyLink, ErrorLine, Modal, Seg } from './ui.tsx';

export function InviteModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [note, setNote] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [seconds, setSeconds] = useState(7 * 86400);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    try {
      const r = await api<{ invitation: Invitation; token: string }>('/v1/invitations', { method: 'POST', body: { note, isAdmin: role === 'admin', seconds } });
      setLink(linkUrl('invite', r.token));
      onCreated();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Modal title={t.inviteModal.title} onClose={onClose}>
      <p className="muted small">{t.inviteModal.sub}</p>
      {link ? (
        <>
          <div className="field"><label>{t.inviteModal.link}</label><CopyLink url={link} /></div>
          <div className="actions"><button className="btn primary" onClick={onClose}>{t.common.done}</button></div>
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor="note"><b>{t.inviteModal.note}</b> {t.inviteModal.noteFor}</label>
            <input id="note" className="input" placeholder={t.inviteModal.noteHint} value={note} onChange={(e) => setNote(e.target.value)} />
            <span className="muted small">{t.inviteModal.noteHelp}</span>
          </div>
          <div className="field"><label>{t.accounts.role}</label><Seg value={role} options={[['user', t.common.user], ['admin', t.common.admin]]} onChange={setRole} /></div>
          <div className="field"><label>{t.inviteModal.valid}</label><Duration seconds={seconds} onChange={setSeconds} /></div>
          <ErrorLine error={error} />
          <div className="actions"><button className="btn ghost" onClick={onClose}>{t.common.cancel}</button><button className="btn primary" onClick={create}>{t.inviteModal.create}</button></div>
        </>
      )}
    </Modal>
  );
}
