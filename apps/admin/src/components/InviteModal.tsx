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
    <Modal title="Inviter quelqu'un" onClose={onClose}>
      <p className="muted small">La personne choisira elle-même son nom et son mot de passe. Vous ne les verrez jamais.</p>
      {link ? (
        <>
          <div className="field"><label>Lien à envoyer (montré une seule fois)</label><CopyLink url={link} /></div>
          <div className="actions"><button className="btn primary" onClick={onClose}>Terminé</button></div>
        </>
      ) : (
        <>
          <div className="field"><label htmlFor="note">Note (pour vous)</label><input id="note" className="input" placeholder="Ex. Cousine" value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <div className="field"><label>Rôle</label><Seg value={role} options={[['user', 'Utilisateur'], ['admin', 'Administrateur']]} onChange={setRole} /></div>
          <div className="field"><label>Valable</label><Duration seconds={seconds} onChange={setSeconds} /></div>
          <ErrorLine error={error} />
          <div className="actions"><button className="btn ghost" onClick={onClose}>Annuler</button><button className="btn primary" onClick={create}>Créer l'invitation</button></div>
        </>
      )}
    </Modal>
  );
}
