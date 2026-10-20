/**
 * @file Layout.tsx
 * @description Frame of the console: the menu on the left, the event bar at the top (live
 *   rates, listeners, imports, CPU and memory, alarms), the page.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { Icon, type IconName } from '@musonic/icons';
import type { Me } from '../App.tsx';
import { bytes, rate, uptime } from '../format.ts';
import { StatusProvider } from '../status.tsx';
import { useStatus } from '../useStatus.ts';

const NAV: { title?: string; items: [string, string, IconName][] }[] = [
  { items: [['/', 'Tableau de bord', 'home']] },
  { title: 'Personnes', items: [['/accounts', 'Comptes', 'person'], ['/security', 'Appareils et sécurité', 'lock']] },
  { title: 'Musique', items: [['/library', 'Bibliothèque', 'library'], ['/imports', 'Imports', 'download'], ['/playback', 'Lecture', 'play']] },
  { title: 'Serveur', items: [['/settings', 'Réglages et maintenance', 'faders'], ['/activity', 'Activité', 'clock'], ['/journal', "Journal d'administration", 'list']] },
];

export function Layout({ me, onSignOut, children }: { me: Me; onSignOut: () => void; children: ReactNode }) {
  return (
    <StatusProvider>
      <Frame me={me} onSignOut={onSignOut}>{children}</Frame>
    </StatusProvider>
  );
}

function Frame({ me, onSignOut, children }: { me: Me; onSignOut: () => void; children: ReactNode }) {
  const status = useStatus();
  const live = status?.live;
  const alarms = status?.alerts ?? [];

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <Icon name="logo" size={30} />
          <div>
            <b>Musonic Server</b>
            <small>{location.host} · {status?.version ?? '…'}</small>
          </div>
        </div>
        <nav className="nav">
          {NAV.map((group, i) => (
            <div key={i}>
              {group.title && <div className="nav-title">{group.title}</div>}
              {group.items.map(([to, label, icon]) => (
                <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'on' : '')}>
                  <Icon name={icon} size={18} className="ico" />
                  {label}
                  {to === '/' && alarms.length > 0 && <span className="count">{alarms.length}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="me">
          <div className="avatar">{me.username.slice(0, 1).toUpperCase()}</div>
          <div>
            <b className="small">{me.username}</b>
            <div className="muted small">Administrateur</div>
          </div>
          <button type="button" className="btn ghost sm" style={{ marginLeft: 'auto' }} title="Se déconnecter" onClick={onSignOut}>
            <Icon name="logout" size={16} />
          </button>
        </div>
      </aside>
      <main className="main">
        <div className="ticker" role="status" aria-label="État du serveur en direct">
          <span className="m"><span className={status ? 'pulse' : 'pulse off'} />{status ? `En ligne · ${uptime(live?.uptimeSecs ?? 0)}` : status === null ? 'Hors ligne' : '…'}</span>
          {live && (
            <>
              <span className="sep" />
              <span className="m"><Icon name="download-arrow" size={14} /> Réception <b>{rate(live.rxBytesPerSec)}</b></span>
              <span className="m"><Icon name="upload-arrow" size={14} /> Envoi <b>{rate(live.txBytesPerSec)}</b></span>
              <span className="m"><Icon name="now-playing" size={14} /> <b>{status.nowPlaying.length}</b> à l'écoute</span>
              <span className="m"><Icon name="download" size={14} /> <b>{status.imports.running + status.imports.pending}</b> import(s)</span>
              <span className="m">CPU <b>{Math.round(live.cpuPercent)} %</b> · RAM <b>{bytes(live.memoryBytes)}</b></span>
            </>
          )}
          {alarms.length > 0 && <span className="sep" />}
          {alarms.map((a) => (
            <Link key={a.kind + a.title} to="/" className={'alarm' + (a.level === 'error' ? '' : ' w')} title={a.detail}>{a.title}</Link>
          ))}
        </div>
        <div className="page">{children}</div>
      </main>
    </div>
  );
}
