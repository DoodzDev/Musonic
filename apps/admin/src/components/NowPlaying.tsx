/**
 * @file NowPlaying.tsx
 * @description Who listens to what right now (dashboard, « Activité »), from the live status.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import type { Playing } from '@musonic/core';
import { relative } from '../format.ts';
import { t } from '../i18n/index.ts';

export function NowPlaying({ playing }: { playing: Playing[] }) {
  return (
    <>
      {playing.map((p, i) => (
        <div key={i} className="list-item">
          <div className="avatar">{p.username.slice(0, 1).toUpperCase()}</div>
          <div><b className="small">{t.dashboard.listensTo(p.username, p.title)}</b><div className="muted small">{p.artist}{p.player ? ` · ${p.player}` : ''} · {relative(p.since)}</div></div>
        </div>
      ))}
      {playing.length === 0 && <p className="muted small">{t.dashboard.nobody}</p>}
    </>
  );
}
