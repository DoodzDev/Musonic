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
import { Duration } from '../components/Duration.tsx';
import { CopyLink, ErrorLine, Modal, Seg, Toggle } from '../components/ui.tsx';

type QuotaKey = 'importsPerDay' | 'importsPerMonth' | 'importBytesMax' | 'maxBitRate';

const QUOTAS: { key: QuotaKey; label: string; presets: [number, string][]; unit: string; scale: number }[] = [
  { key: 'importsPerDay', label: 'Imports par jour', presets: [[10, '10'], [50, '50']], unit: 'imports', scale: 1 },
  { key: 'importsPerMonth', label: 'Imports par mois', presets: [[100, '100'], [500, '500']], unit: 'imports', scale: 1 },
  { key: 'importBytesMax', label: 'Place maximale de ses imports', presets: [[1, '1 Go'], [5, '5 Go']], unit: 'Go', scale: 1e9 },
  { key: 'maxBitRate', label: 'Débit maximal en lecture', presets: [[320, '320 kbit/s'], [192, '192 kbit/s'], [128, '128 kbit/s']], unit: 'kbit/s', scale: 1 },
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
        <option value="none">{q.key === 'maxBitRate' ? 'Sans limite' : 'Illimité'}</option>
        {q.presets.map(([p, l]) => <option key={p} value={p}>{l}</option>)}
        <option value="custom">Personnalisé…</option>
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
    return p.then(load).catch((e: Error) => setError(e.message.includes('administrator') ? 'Le serveur doit garder au moins un administrateur actif.' : e.message));
  };
  const patch = (body: object) => run(api(`/v1/users/${id}`, { method: 'PATCH', body }));
  const setLimits = (changes: Partial<Limits>) => {
    setSaved(false);
    void run(api(`/v1/users/${id}/limits`, { method: 'PUT', body: { ...a.limits, ...changes } }).then(() => setSaved(true)));
  };
  const rights: [keyof Limits, string, string][] = [
    ['canImport', 'Importer depuis Deezer', 'Ses likes et playlists de titres en ligne sont téléchargés.'],
    ['canOnline', 'Voir le catalogue en ligne', 'Recherche, pages et écoute hors de la bibliothèque.'],
    ['canDownload', 'Télécharger les fichiers', 'Téléchargement direct depuis les applications.'],
    ['canPublicPlaylists', 'Playlists publiques', 'Visibles par les autres comptes.'],
  ];

  return (
    <>
      <Link className="btn ghost sm" to="/accounts"><Icon name="back-arrow" size={14} /> Comptes</Link>
      <div className="head mt-s">
        <div className="row">
          <div className="avatar" style={{ width: 56, height: 56, fontSize: 22 }}>{a.username.slice(0, 1).toUpperCase()}</div>
          <div><h1>{a.username}{isMe && <span className="muted small" style={{ marginLeft: 8 }}>vous</span>}</h1><p className="sub">{a.isAdmin ? 'Administrateur' : 'Utilisateur'} · compte créé le {date(a.createdAt)} · dernière connexion : {relative(a.lastLoginAt).toLowerCase()}</p></div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setModal('reset')}>Lien de réinitialisation</button>
          {!isMe && <button className="btn danger" onClick={() => setModal('delete')}><Icon name="trash" size={14} /> Supprimer</button>}
        </div>
      </div>
      <ErrorLine error={error} />

      <div className="grid g2">
        <div className="card">
          <h2>Rôle</h2>
          <Seg value={a.isAdmin ? 'admin' : 'user'} options={[['user', 'Utilisateur'], ['admin', 'Administrateur']]} onChange={(v) => patch({ isAdmin: v === 'admin' })} />
          <p className="muted small mt-s">Un administrateur gère le serveur depuis cette console. Dans les applications, les deux rôles ont exactement les mêmes fonctions.</p>
          <h2 className="mt">Compte</h2>
          <div className="setting"><div><b>Compte actif</b><p>Suspendu : il ne peut plus se connecter, rien n'est supprimé.</p></div><Toggle label="Compte actif" on={!a.suspended} onChange={(on) => patch({ suspended: !on })} /></div>
          <div className="setting"><div><b>Déconnecter partout</b><p>Ferme ses sessions et révoque ses clés d'appareils.</p></div><button className="btn sm" onClick={() => run(api(`/v1/users/${id}/logout`, { method: 'POST' }))}>Déconnecter</button></div>
        </div>
        <div className="card">
          <h2>Droits</h2>
          {a.isAdmin ? (
            <p className="muted small">Les administrateurs ne sont jamais limités.</p>
          ) : (
            rights.map(([key, title, desc]) => (
              <div key={key} className="setting"><div><b>{title}</b><p>{desc}</p></div><Toggle label={title} on={Boolean(a.limits[key])} onChange={(on) => setLimits({ [key]: on })} /></div>
            ))
          )}
        </div>
        {!a.isAdmin && (
          <div className="card" style={{ gridColumn: '1/-1' }}>
            <div className="spread"><h2 style={{ margin: 0 }}>Quotas</h2><span className="muted small">{saved ? 'Enregistré' : 'Par défaut : illimité'}</span></div>
            <div className="grid g4 mt-s">
              {QUOTAS.map((q) => <QuotaField key={q.key} q={q} value={(a.limits[q.key] as number | null) ?? null} onChange={(v) => setLimits({ [q.key]: v })} />)}
            </div>
            <div className="small muted">Ce mois-ci : {a.importsThisMonth} import(s).</div>
          </div>
        )}
        <div className="card" style={{ gridColumn: '1/-1' }}>
          <h2>Appareils</h2>
          {d.apiKeys.map((k) => (
            <div key={k.id} className="list-item">
              <Icon name="phone" size={18} />
              <div><b className="small">{k.name}</b><div className="muted small">Créée {relative(k.created_at)} · dernière utilisation : {relative(k.last_used_at).toLowerCase()}</div></div>
              <button className="btn sm danger" style={{ marginLeft: 'auto' }} onClick={() => run(api(`/v1/users/${id}/api-keys/${k.id}`, { method: 'DELETE' }))}>Révoquer</button>
            </div>
          ))}
          {d.apiKeys.length === 0 && <p className="muted small">Aucune clé d'appareil. Les adresses IP et les connexions arrivent avec la tranche C6.</p>}
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
    <Modal title={`Réinitialiser le mot de passe de ${username}`} onClose={onClose}>
      <p className="muted small">Envoyez-lui le lien : il choisira son nouveau mot de passe. Usage unique. Vous ne verrez jamais le mot de passe.</p>
      {link ? (
        <>
          <CopyLink url={link} />
          <div className="actions"><button className="btn primary" onClick={onClose}>Terminé</button></div>
        </>
      ) : (
        <>
          <div className="field"><label>Valable</label><Duration seconds={seconds} onChange={setSeconds} /></div>
          <div className="setting"><div><b>Déconnecter ses appareils</b><p>Quand il aura choisi son nouveau mot de passe.</p></div><Toggle label="Déconnecter ses appareils" on={logout} onChange={setLogout} /></div>
          <ErrorLine error={error} />
          <div className="actions"><button className="btn ghost" onClick={onClose}>Annuler</button><button className="btn primary" onClick={create}>Créer le lien</button></div>
        </>
      )}
    </Modal>
  );
}

function DeleteModal({ username, onClose, onDelete }: { username: string; onClose: () => void; onDelete: () => Promise<unknown> }) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title={`Supprimer le compte de ${username} ?`} onClose={onClose}>
      <p className="muted small">Ses likes, playlists, écoutes et appareils seront supprimés. Les titres de la bibliothèque restent. C'est définitif.</p>
      <div className="field"><label>Tapez <b>{username}</b> pour confirmer</label><input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} /></div>
      <ErrorLine error={error} />
      <div className="actions">
        <button className="btn ghost" onClick={onClose}>Annuler</button>
        <button className="btn danger" disabled={typed !== username} onClick={() => onDelete().catch((e: Error) => setError(e.message))}>Supprimer définitivement</button>
      </div>
    </Modal>
  );
}
