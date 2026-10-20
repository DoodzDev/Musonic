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
import { alertText } from '../alerts.ts';
import { t } from '../i18n/index.ts';
import { StatusProvider } from '../status.tsx';
import { useStatus } from '../useStatus.ts';

const n = t.nav;
const NAV: { title?: string; items: [string, string, IconName][] }[] = [
  { items: [['/', n.dashboard, 'home']] },
  { title: n.people, items: [['/accounts', n.accounts, 'person'], ['/security', n.security, 'lock']] },
  { title: n.music, items: [['/library', n.library, 'library'], ['/imports', n.imports, 'download'], ['/playback', n.playback, 'play']] },
  { title: n.server, items: [['/data', n.data, 'grid'], ['/settings', n.settings, 'faders'], ['/activity', n.activity, 'clock'], ['/journal', n.journal, 'list']] },
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
            <div className="muted small">{t.common.admin}</div>
          </div>
          <button type="button" className="btn ghost sm" style={{ marginLeft: 'auto' }} title={t.nav.signOut} onClick={onSignOut}>
            <Icon name="logout" size={16} />
          </button>
        </div>
      </aside>
      <main className="main">
        <div className="ticker" role="status" aria-label={t.ticker.label}>
          <span className="m"><span className={status ? 'pulse' : 'pulse off'} />{status ? t.ticker.online(uptime(live?.uptimeSecs ?? 0)) : status === null ? t.ticker.offline : '…'}</span>
          {live && (
            <>
              <span className="sep" />
              <span className="m"><Icon name="download-arrow" size={14} /> {t.ticker.received} <b>{rate(live.rxBytesPerSec)}</b></span>
              <span className="m"><Icon name="upload-arrow" size={14} /> {t.ticker.sent} <b>{rate(live.txBytesPerSec)}</b></span>
              <span className="m"><Icon name="now-playing" size={14} /> <b>{status.nowPlaying.length}</b> {t.ticker.listening}</span>
              <span className="m"><Icon name="download" size={14} /> <b>{status.imports.running + status.imports.pending}</b> {t.ticker.imports}</span>
              <span className="m">CPU <b>{Math.round(live.cpuPercent)} %</b> · RAM <b>{bytes(live.memoryBytes)}</b></span>
            </>
          )}
          {alarms.length > 0 && <span className="sep" />}
          {alarms.map((a) => (
            <Link key={a.kind} to="/" className={'alarm' + (a.level === 'error' ? '' : ' w')} title={alertText(a)[1]}>{alertText(a)[0]}</Link>
          ))}
        </div>
        <div className="page">{children}</div>
      </main>
    </div>
  );
}
