/**
 * @file DashboardPage.tsx
 * @description Home of the console: alerts, figures of the library, disk space (server and
 *   music) and this month's traffic (in detail on « Données »), recent activity, who is listening, versions. Live, from the shared status.
 * @author DoodzProg
 * @version 0.3.0
 * @license CC-BY-NC-4.0
 */

import { Link } from 'react-router';
import { Icon } from '@musonic/icons';
import type { AdminStatus, Measures } from '@musonic/core';
import { bytes, hours, relative, uptime } from '../format.ts';
import { useStatus } from '../useStatus.ts';
import { alertText } from '../alerts.ts';
import { describe, icon } from '../journal.ts';
import { NowPlaying } from '../components/NowPlaying.tsx';
import { t } from '../i18n/index.ts';
import { monthTraffic, useMonthTraffic } from '../traffic.ts';
import { QuotaMeter } from '../components/QuotaMeter.tsx';

function Bar({ part, of, color, sub }: { part: number; of: number; color?: string; sub?: number }) {
  const pct = (v: number) => `${Math.min(100, (v / Math.max(of, 1)) * 100)}%`;
  return (
    <div className="bar mt-s">
      <i style={{ width: pct(part - (sub ?? 0)), background: color }} />
      {sub ? <i className="part" style={{ width: pct(sub) }} /> : null}
    </div>
  );
}

function DiskCard({ s, month }: { s: AdminStatus; month: Measures | null }) {
  const d = s.disk;
  const used = d ? d.totalBytes - d.freeBytes : 0;
  return (
    <div className="card">
      <div className="spread"><h2 style={{ margin: 0 }}>{t.dashboard.disk}</h2><Link className="btn ghost sm" to="/data">{t.dashboard.seeData} <Icon name="chevron-right" size={14} /></Link></div>
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
      {month && (
        <>
          <div className="spread small mt"><b>{t.dashboard.traffic}</b><span className="muted">{bytes(monthTraffic(month).sent)}{month.quotaOutBytes > 0 ? ` / ${bytes(month.quotaOutBytes)}` : ''}</span></div>
          <QuotaMeter m={month} />
        </>
      )}
    </div>
  );
}

export function DashboardPage() {
  const s = useStatus();
  const [month] = useMonthTraffic();
  if (s === undefined) return <div className="head"><div><h1>{t.dashboard.title}</h1><p className="sub">…</p></div></div>;
  if (s === null) return <div className="head"><div><h1>{t.dashboard.title}</h1><p className="sub">{t.common.noAnswer}</p></div></div>;
  const web = s.releases.web;
  const server = s.releases.server;

  return (
    <>
      <div className="head">
        <div><h1>{t.dashboard.title}</h1><p className="sub">{s.alerts.length ? t.dashboard.toLook(s.alerts.length) : t.dashboard.allGood} · {t.dashboard.onlineFor(uptime(s.live.uptimeSecs))}</p></div>
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
        <DiskCard s={s} month={month} />
        <div className="card">
          <div className="spread"><h2 style={{ margin: 0 }}>{t.dashboard.recent}</h2><Link className="btn ghost sm" to="/activity">{t.common.seeMore} <Icon name="chevron-right" size={14} /></Link></div>
          {s.recent.slice(0, 4).map((a) => (
            <div key={a.id} className="list-item">
              <Icon name={icon(a)} size={18} />
              <div><b className="small">{describe(a)}</b><div className="muted small">{relative(a.at)}{a.device ? ` · ${a.device}` : ''}</div></div>
            </div>
          ))}
          {s.recent.length === 0 && <p className="muted small">{t.dashboard.nothing}</p>}
        </div>
      </div>

      <div className="grid g2 mt">
        <div className="card">
          <div className="spread"><h2 style={{ margin: 0 }}>{t.dashboard.now}</h2><span className="muted small">{t.dashboard.nowCount(s.nowPlaying.length)}</span></div>
          <NowPlaying playing={s.nowPlaying} />
          <p className="note mt-s">{t.dashboard.connectSoon}</p>
        </div>
        <div className="card">
          <h2>{t.dashboard.versions}</h2>
          <div className="setting"><div><b>Musonic Server</b><p>{t.dashboard.installed(s.version)}{server ? t.dashboard.latest(server.version) : ''}</p></div>{s.serverUpdate ? <a className="text-link" href={server?.url} target="_blank" rel="noreferrer">{t.dashboard.update}</a> : <span className="muted small">{t.dashboard.upToDate}</span>}</div>
          <div className="setting"><div><b>Musonic Web</b><p>{web ? t.dashboard.webLatest(web.version) : t.dashboard.webUnknown} · {t.dashboard.webSoon}</p></div>{web && <a className="btn sm" href={web.url} target="_blank" rel="noreferrer">{t.common.see}</a>}</div>
          <p className="muted small">{s.releases.checkedAt ? t.dashboard.checked(relative(s.releases.checkedAt).toLowerCase()) : t.dashboard.notChecked}</p>
        </div>
      </div>
    </>
  );
}
