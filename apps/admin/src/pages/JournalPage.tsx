/**
 * @file JournalPage.tsx
 * @description « Activité » (everything the server journals) and « Journal d'administration »
 *   (what administrators did): newest first, grouped by day, filtered by family, period and
 *   search, more lines as the page scrolls, new lines arriving live.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@musonic/icons';
import type { JournalEntry, JournalPage as Page, JournalSize } from '@musonic/core';
import { api } from '../api.ts';
import { bytes, date } from '../format.ts';
import { t } from '../i18n/index.ts';
import { KINDS, describe, icon, isProblem, type Kind } from '../journal.ts';
import { ErrorLine, Seg } from '../components/ui.tsx';
import { NowPlaying } from '../components/NowPlaying.tsx';
import { useStatus } from '../useStatus.ts';
import { useHashScroll } from '../hash.ts';

type Period = 'all' | 'day' | 'week' | 'month';
const PAGE = 100;
const LIVE_MS = 5000;

function since(period: Period): number | null {
  const now = new Date();
  switch (period) {
    case 'day':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
    case 'week':
      return Math.floor(now.getTime() / 1000) - 7 * 86400;
    case 'month':
      return Math.floor(now.getTime() / 1000) - 30 * 86400;
    default:
      return null;
  }
}

function dayLabel(at: number): string {
  const d = new Date(at * 1000);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return t.journal.today;
  if (d.toDateString() === yesterday.toDateString()) return t.journal.yesterday;
  return new Intl.DateTimeFormat(t.locale, { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' }).format(d);
}

const time = new Intl.DateTimeFormat(t.locale, { hour: '2-digit', minute: '2-digit' });

function Line({ e, admin }: { e: JournalEntry; admin: boolean }) {
  const meta = [e.device, e.ip].filter(Boolean).join(' · ');
  return (
    <div className={'jrow' + (isProblem(e) ? ' problem' : '')}>
      <span className="jtime">{time.format(e.at * 1000)}</span>
      <Icon name={icon(e)} size={16} className="jico" />
      <span className="jtext">{describe(e)}{e.admin && !admin && <span className="jtag">{t.common.admin}</span>}</span>
      {meta && <span className="jmeta">{meta}</span>}
    </div>
  );
}

/** « En direct »: who listens to what, live. */
function LiveNow() {
  const s = useStatus();
  useHashScroll(Boolean(s));
  if (!s) return null;
  return (
    <div id="now" className="card anchor" style={{ marginBottom: 18 }}>
      <div className="spread"><h2 style={{ margin: 0 }}>{t.journal.live}</h2><span className="muted small">{t.dashboard.nowCount(s.nowPlaying.length)}</span></div>
      <NowPlaying playing={s.nowPlaying} />
    </div>
  );
}

function JournalView({ admin }: { admin: boolean }) {
  const [kind, setKind] = useState<Kind>('all');
  const [period, setPeriod] = useState<Period>('all');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [size, setSize] = useState<JournalSize | null>(null);
  const [end, setEnd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);

  // Typing settles before searching.
  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const query = useCallback(
    (extra: Record<string, string>) => {
      const p = new URLSearchParams({ limit: String(PAGE), ...extra });
      if (admin) p.set('admin', 'true');
      if (KINDS[kind]) p.set('kind', KINDS[kind]);
      if (q) p.set('q', q);
      const from = since(period);
      if (from) p.set('from', String(from));
      return api<Page>(`/v1/admin/journal?${p}`);
    },
    [admin, kind, q, period],
  );

  useEffect(() => {
    // The previous list stays shown until the new one arrives.
    let live = true;
    query({})
      .then((r) => {
        if (!live) return;
        setEntries(r.entries);
        setSize(r.size);
        setEnd(r.entries.length < PAGE);
        setError(null);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [query]);

  const more = useCallback(() => {
    if (busy.current || end || !entries?.length) return;
    busy.current = true;
    query({ before: String(entries[entries.length - 1].id) })
      .then((r) => {
        setEntries((old) => [...(old ?? []), ...r.entries]);
        setEnd(r.entries.length < PAGE);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => {
        busy.current = false;
      });
  }, [query, end, entries]);

  // More lines when the bottom of the list comes into view.
  useEffect(() => {
    const el = bottom.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && more(), { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [more]);

  // New lines, live.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible' || !entries) return;
      query(entries.length ? { after: String(entries[0].id), limit: '500' } : {})
        .then((r) => {
          setSize(r.size);
          // Newest first, like the list.
          if (r.entries.length) setEntries((old) => [...r.entries, ...(old ?? [])]);
        })
        .catch(() => {});
    }, LIVE_MS);
    return () => clearInterval(id);
  }, [query, entries]);

  const days: [string, JournalEntry[]][] = [];
  for (const e of entries ?? []) {
    const label = dayLabel(e.at);
    if (days.length && days[days.length - 1][0] === label) days[days.length - 1][1].push(e);
    else days.push([label, [e]]);
  }

  return (
    <>
      <div className="head">
        <div>
          <h1>{admin ? t.journal.adminTitle : t.journal.activityTitle}</h1>
          <p className="sub">{admin ? t.journal.adminSub : t.journal.activitySub}</p>
          {size && <p className="muted small" style={{ margin: '4px 0 0' }}>{t.journal.summary(size.lines.toLocaleString(t.locale), bytes(size.bytes), bytes(size.maxBytes))}{size.oldest ? t.journal.since(date(size.oldest)) : ''}</p>}
        </div>
      </div>
      {!admin && <LiveNow />}
      <div className="filters">
        {!admin && <Seg value={kind} options={(Object.keys(KINDS) as Kind[]).map((k) => [k, t.journal.kinds[k]] as [Kind, string])} onChange={setKind} />}
        <Seg value={period} options={(['all', 'day', 'week', 'month'] as Period[]).map((p) => [p, t.journal.periods[p]] as [Period, string])} onChange={setPeriod} />
        <label className="search">
          <Icon name="search" size={16} />
          <input value={search} placeholder={t.journal.search} aria-label={t.journal.search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>
      <ErrorLine error={error} />
      <div className="card mt-s journal">
        {entries === null && <p className="muted small">…</p>}
        {entries?.length === 0 && <p className="empty">{t.journal.empty}</p>}
        {days.map(([label, list]) => (
          <section key={label}>
            <h3 className="jday">{label}</h3>
            {list.map((e) => <Line key={e.id} e={e} admin={admin} />)}
          </section>
        ))}
        <div ref={bottom} />
        {entries && entries.length > 0 && (end ? <p className="muted small jend">{t.journal.end}</p> : <button type="button" className="btn sm mt-s" onClick={more}>{t.journal.more}</button>)}
      </div>
    </>
  );
}

export function ActivityPage() {
  return <JournalView key="activity" admin={false} />;
}

export function AdminJournalPage() {
  return <JournalView key="admin" admin />;
}
