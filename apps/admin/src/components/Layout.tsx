/**
 * @file Layout.tsx
 * @description Frame of the console: the menu on the left, the event bar at the top (live
 *   figures and alarms; filled in by lot C2), the page.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router';
import { Icon, type IconName } from '@musonic/icons';
import type { Me } from '../App.tsx';

interface Health {
  status: string;
  version: string;
  alerts: Record<string, string>;
  imports?: { pending: number; running: number; failed: number };
}

const NAV: { title?: string; items: [string, string, IconName][] }[] = [
  { items: [['/', 'Tableau de bord', 'home']] },
  { title: 'Personnes', items: [['/accounts', 'Comptes', 'person'], ['/security', 'Appareils et sécurité', 'lock']] },
  { title: 'Musique', items: [['/library', 'Bibliothèque', 'library'], ['/imports', 'Imports', 'download'], ['/playback', 'Lecture', 'play']] },
  { title: 'Serveur', items: [['/settings', 'Réglages et maintenance', 'faders'], ['/activity', 'Activité', 'clock'], ['/journal', "Journal d'administration", 'list']] },
];

export function Layout({ me, onSignOut, children }: { me: Me; onSignOut: () => void; children: ReactNode }) {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    const load = () => fetch('/health').then((r) => r.json()).then(setHealth).catch(() => setHealth(null));
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);
  const alerts = Object.entries(health?.alerts ?? {});

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <Icon name="logo" size={30} />
          <div>
            <b>Musonic Server</b>
            <small>{location.host} · {health?.version ?? '…'}</small>
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
        <div className="ticker">
          <span className="m">
            <span className={health?.status === 'degraded' || !health ? '' : 'pulse'} />
            {health ? 'En ligne' : 'Hors ligne'}
          </span>
          {health?.imports && (
            <>
              <span className="sep" />
              <span className="m">
                <Icon name="download" size={14} /> <b>{health.imports.running + health.imports.pending}</b> import(s) en cours
              </span>
            </>
          )}
          {alerts.map(([provider, what]) => (
            <span key={provider} className="alarm">
              <Icon name="cloud" size={14} /> {provider} : {what === 'credentials_expired' ? 'identifiants expirés' : what}
            </span>
          ))}
          {(health?.imports?.failed ?? 0) > 0 && <span className="alarm w">{health!.imports!.failed} import(s) en échec</span>}
        </div>
        <div className="page">{children}</div>
      </main>
    </div>
  );
}
