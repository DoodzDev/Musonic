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
import { alertText } from '../alerts.ts';
import { t } from '../i18n/index.ts';

function activityText(a: Activity): string {
  switch (a.kind) {
    case 'import':
      return t.dashboard.importedBy(a.what, a.who);
    case 'login':
      return t.dashboard.signedIn(a.who ?? '?');
    default:
      return t.dashboard.created(a.who ?? '?');
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
      <h2>{t.dashboard.disk}</h2>
      {d ? (
        <>
          <div className="spread small"><span><span className="legend" style={{ background: 'var(--blue)' }} /><b>{t.dashboard.server}</b> {t.dashboard.wholeDisk} : {t.dashboard.of(bytes(used), bytes(d.totalBytes))}</span><span className="muted">{Math.round((used / d.totalBytes) * 100)} %</span></div>
          <Bar part={used} of={d.totalBytes} color="var(--blue)" />
          <div className="spread small mt"><span><span className="legend" /><b>{t.dashboard.musicLabel}</b> {t.dashboard.musicSub} : {bytes(s.library.bytes)}</span><span className="muted">{t.dashboard.ofDisk(((s.library.bytes / d.totalBytes) * 100).toLocaleString(t.locale, { maximumFractionDigits: 1 }))}</span></div>
          <Bar part={s.library.bytes} of={d.totalBytes} sub={s.library.importedBytes} />
          <div className="small muted mt-s"><span className="legend" style={{ background: 'var(--accent-2)' }} />{t.dashboard.importsPart(bytes(s.library.importedBytes))}</div>
        </>
      ) : (
        <p className="muted small">{t.dashboard.diskUnknown}</p>
      )}
      <dl className="kv mt">
        <dt>{t.dashboard.database}</dt><dd>{bytes(s.folders.databaseBytes)}</dd>
        <dt>{t.dashboard.backups}</dt><dd>{s.folders.backups} · {bytes(s.folders.backupsBytes)}{s.folders.lastBackupAt ? t.dashboard.lastBackup(relative(s.folders.lastBackupAt).toLowerCase()) : ''}</dd>
        <dt>{t.dashboard.caches}</dt><dd>{bytes(s.folders.cacheBytes)}</dd>
      </dl>
    </div>
  );
}

export function DashboardPage() {
  const s = useStatus();
  if (s === undefined) return <div className="head"><div><h1>{t.dashboard.title}</h1><p className="sub">…</p></div></div>;
  if (s === null) return <div className="head"><div><h1>{t.dashboard.title}</h1><p className="sub">{t.common.noAnswer}</p></div></div>;
  const web = s.releases.web;
  const server = s.releases.server;

  return (
    <>
      <div className="head">
        <div><h1>{t.dashboard.title}</h1><p className="sub">{s.alerts.length ? t.dashboard.toLook(s.alerts.length) : t.dashboard.allGood}</p></div>
        <span className="tag ok"><span className="dotlive" />{t.dashboard.onlineFor(uptime(s.live.uptimeSecs))}</span>
      </div>

      {s.alerts.map((a) => {
        const [title, detail] = alertText(a);
        return (
          <div key={a.kind} className={'alert' + (a.level === 'error' ? '' : ' warn')}>
            <div><b>{title}</b><p>{detail}</p></div>
            {a.kind === 'imports' && <Link className="btn sm" style={{ marginLeft: 'auto' }} to="/imports">{t.common.see}</Link>}
            {a.kind === 'update' && server?.url && <a className="btn sm" style={{ marginLeft: 'auto' }} href={server.url} target="_blank" rel="noreferrer">{t.alerts.seeRelease}</a>}
          </div>
        );
      })}

      <div className="grid g4 mt-s">
        <div className="card stat"><b>{s.library.tracks.toLocaleString(t.locale)}</b><span>{t.dashboard.tracks}</span><br /><em>{t.dashboard.imported(s.imports.done)}</em></div>
        <div className="card stat"><b>{s.library.albums.toLocaleString(t.locale)}</b><span>{t.dashboard.albums}</span><br /><em>{t.dashboard.artists(s.library.artists.toLocaleString(t.locale))}</em></div>
        <div className="card stat"><b>{bytes(s.library.bytes)}</b><span>{t.dashboard.music}</span><br /><em>{t.dashboard.listening(hours(s.library.durationSecs))}</em></div>
        <div className="card stat"><b>{s.library.accounts}</b><span>{t.dashboard.accounts}</span><br /><em>{t.dashboard.devices(s.library.devices)}</em></div>
      </div>

      <div className="grid g2 mt">
        <DiskCard s={s} />
        <div className="card">
          <div className="spread"><h2 style={{ margin: 0 }}>{t.dashboard.recent}</h2><Link className="btn ghost sm" to="/activity">{t.common.seeMore} <Icon name="chevron-right" size={14} /></Link></div>
          {s.recent.map((a, i) => (
            <div key={i} className="list-item">
              {a.kind === 'import' ? <Icon name="download" size={18} /> : <div className="avatar">{(a.who ?? '?').slice(0, 1).toUpperCase()}</div>}
              <div><b className="small">{activityText(a)}</b><div className="muted small">{relative(a.at)}</div></div>
            </div>
          ))}
          {s.recent.length === 0 && <p className="muted small">{t.dashboard.nothing}</p>}
        </div>
      </div>

      <div className="grid g2 mt">
        <div className="card">
          <div className="spread"><h2 style={{ margin: 0 }}>{t.dashboard.now}</h2><span className="muted small">{t.dashboard.nowCount(s.nowPlaying.length)}</span></div>
          {s.nowPlaying.map((p, i) => (
            <div key={i} className="list-item">
              <div className="avatar">{p.username.slice(0, 1).toUpperCase()}</div>
              <div><b className="small">{t.dashboard.listensTo(p.username, p.title)}</b><div className="muted small">{p.artist}{p.player ? ` · ${p.player}` : ''} · {relative(p.since)}</div></div>
            </div>
          ))}
          {s.nowPlaying.length === 0 && <p className="muted small">{t.dashboard.nobody}</p>}
          <p className="note mt-s">{t.dashboard.connectSoon}</p>
        </div>
        <div className="card">
          <h2>{t.dashboard.versions}</h2>
          <div className="setting"><div><b>Musonic Server</b><p>{t.dashboard.installed(s.version)}{server ? t.dashboard.latest(server.version) : ''}</p></div>{s.serverUpdate ? <a className="tag wait" href={server?.url} target="_blank" rel="noreferrer">{t.dashboard.update}</a> : <span className="tag ok">{t.dashboard.upToDate}</span>}</div>
          <div className="setting"><div><b>Musonic Web</b><p>{web ? t.dashboard.webLatest(web.version) : t.dashboard.webUnknown} · {t.dashboard.webSoon}</p></div>{web && <a className="btn sm" href={web.url} target="_blank" rel="noreferrer">{t.common.see}</a>}</div>
          <p className="muted small">{s.releases.checkedAt ? t.dashboard.checked(relative(s.releases.checkedAt).toLowerCase()) : t.dashboard.notChecked}</p>
        </div>
      </div>
    </>
  );
}
