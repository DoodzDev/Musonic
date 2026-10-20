/**
 * @file DashboardPage.tsx
 * @description Home of the console: alerts, figures of the library, disk space (server and
 *   music), recent activity, who is listening, versions. Live, from the shared status.
 * @author DoodzProg
 * @version 0.2.0
 * @license CC-BY-NC-4.0
 */

import { Link } from 'react-router';
import { Icon } from '@musonic/icons';
import type { Activity, AdminStatus } from '@musonic/core';
import { bytes, hours, relative, uptime } from '../format.ts';
import { useStatus } from '../useStatus.ts';

function activityText(a: Activity): string {
  switch (a.kind) {
    case 'import':
      return `Importé : ${a.what}${a.who ? ` · demandé par ${a.who}` : ''}`;
    case 'login':
      return `${a.who} s'est connecté`;
    default:
      return `Compte ${a.who} créé`;
  }
}

function Bar({ part, of, color, sub }: { part: number; of: number; color?: string; sub?: number }) {
  const pct = (v: number) => `${Math.min(100, (v / Math.max(of, 1)) * 100)}%`;
  return (
    <div className="bar mt-s">
      <i style={{ width: pct(part - (sub ?? 0)), background: color }} />
      {sub ? <i className="part" style={{ width: pct(sub) }} /> : null}
    </div>
  );
}

function DiskCard({ s }: { s: AdminStatus }) {
  const d = s.disk;
  const used = d ? d.totalBytes - d.freeBytes : 0;
  return (
    <div className="card">
      <h2>Espace disque</h2>
      {d ? (
        <>
          <div className="spread small"><span><span className="legend" style={{ background: 'var(--blue)' }} /><b>Serveur</b> (tout le disque) : {bytes(used)} sur {bytes(d.totalBytes)}</span><span className="muted">{Math.round((used / d.totalBytes) * 100)} %</span></div>
          <Bar part={used} of={d.totalBytes} color="var(--blue)" />
          <div className="spread small mt"><span><span className="legend" /><b>Musique</b> (bibliothèque + imports) : {bytes(s.library.bytes)}</span><span className="muted">{((s.library.bytes / d.totalBytes) * 100).toLocaleString('fr', { maximumFractionDigits: 1 })} % du disque</span></div>
          <Bar part={s.library.bytes} of={d.totalBytes} sub={s.library.importedBytes} />
          <div className="small muted mt-s"><span className="legend" style={{ background: 'var(--accent-2)' }} />dont imports Musonic : {bytes(s.library.importedBytes)}</div>
        </>
      ) : (
        <p className="muted small">Place disque inconnue sur ce système.</p>
      )}
      <dl className="kv mt">
        <dt>Base de données</dt><dd>{bytes(s.folders.databaseBytes)}</dd>
        <dt>Sauvegardes</dt><dd>{s.folders.backups} · {bytes(s.folders.backupsBytes)}{s.folders.lastBackupAt ? ` · dernière ${relative(s.folders.lastBackupAt).toLowerCase()}` : ''}</dd>
        <dt>Caches</dt><dd>{bytes(s.folders.cacheBytes)}</dd>
      </dl>
    </div>
  );
}

export function DashboardPage() {
  const s = useStatus();
  if (s === undefined) return <div className="head"><div><h1>Tableau de bord</h1><p className="sub">…</p></div></div>;
  if (s === null) return <div className="head"><div><h1>Tableau de bord</h1><p className="sub">Le serveur ne répond pas.</p></div></div>;
  const web = s.releases.web;
  const server = s.releases.server;

  return (
    <>
      <div className="head">
        <div><h1>Tableau de bord</h1><p className="sub">{s.alerts.length ? `${s.alerts.length} point${s.alerts.length > 1 ? 's' : ''} à regarder.` : 'Tout va bien.'}</p></div>
        <span className="tag ok"><span className="dotlive" />En ligne depuis {uptime(s.live.uptimeSecs)}</span>
      </div>

      {s.alerts.map((a) => (
        <div key={a.kind + a.title} className={'alert' + (a.level === 'error' ? '' : ' warn')}>
          <div><b>{a.title}</b><p>{a.detail}</p></div>
          {a.kind === 'imports' && <Link className="btn sm" style={{ marginLeft: 'auto' }} to="/imports">Voir</Link>}
          {a.kind === 'update' && server?.url && <a className="btn sm" style={{ marginLeft: 'auto' }} href={server.url} target="_blank" rel="noreferrer">Voir la version</a>}
        </div>
      ))}

      <div className="grid g4 mt-s">
        <div className="card stat"><b>{s.library.tracks.toLocaleString('fr')}</b><span>titres</span><br /><em>{s.imports.done} importé(s) en tout</em></div>
        <div className="card stat"><b>{s.library.albums.toLocaleString('fr')}</b><span>albums</span><br /><em>{s.library.artists.toLocaleString('fr')} artistes</em></div>
        <div className="card stat"><b>{bytes(s.library.bytes)}</b><span>de musique</span><br /><em>{hours(s.library.durationSecs)} d'écoute</em></div>
        <div className="card stat"><b>{s.library.accounts}</b><span>comptes</span><br /><em>{s.library.devices} appareil(s)</em></div>
      </div>

      <div className="grid g2 mt">
        <DiskCard s={s} />
        <div className="card">
          <div className="spread"><h2 style={{ margin: 0 }}>Activité récente</h2><Link className="btn ghost sm" to="/activity">Voir plus <Icon name="chevron-right" size={14} /></Link></div>
          {s.recent.map((a, i) => (
            <div key={i} className="list-item">
              {a.kind === 'import' ? <Icon name="download" size={18} /> : <div className="avatar">{(a.who ?? '?').slice(0, 1).toUpperCase()}</div>}
              <div><b className="small">{activityText(a)}</b><div className="muted small">{relative(a.at)}</div></div>
            </div>
          ))}
          {s.recent.length === 0 && <p className="muted small">Rien pour l'instant.</p>}
        </div>
      </div>

      <div className="grid g2 mt">
        <div className="card">
          <div className="spread"><h2 style={{ margin: 0 }}>En ce moment</h2><span className="muted small">{s.nowPlaying.length} à l'écoute</span></div>
          {s.nowPlaying.map((p, i) => (
            <div key={i} className="list-item">
              <div className="avatar">{p.username.slice(0, 1).toUpperCase()}</div>
              <div><b className="small">{p.username} écoute « {p.title} »</b><div className="muted small">{p.artist}{p.player ? ` · ${p.player}` : ''} · depuis {relative(p.since).replace('il y a ', '')}</div></div>
            </div>
          ))}
          {s.nowPlaying.length === 0 && <p className="muted small">Personne n'écoute en ce moment.</p>}
          <p className="note mt-s">Piloter la lecture de chacun (pause, titre, appareil) arrive avec Musonic Connect.</p>
        </div>
        <div className="card">
          <h2>Versions</h2>
          <div className="setting"><div><b>Musonic Server</b><p>Installée : {s.version}{server ? ` · dernière : ${server.version}` : ''}</p></div>{s.serverUpdate ? <a className="tag wait" href={server?.url} target="_blank" rel="noreferrer">Mise à jour disponible</a> : <span className="tag ok">À jour</span>}</div>
          <div className="setting"><div><b>Musonic Web</b><p>{web ? `Dernière version : ${web.version}` : 'Version inconnue'} · l'installer sur ce serveur arrive avec la tranche C7</p></div>{web && <a className="btn sm" href={web.url} target="_blank" rel="noreferrer">Voir</a>}</div>
          <p className="muted small">{s.releases.checkedAt ? `Vérifié sur GitHub ${relative(s.releases.checkedAt).toLowerCase()}.` : 'Pas encore vérifié sur GitHub.'}</p>
        </div>
      </div>
    </>
  );
}
