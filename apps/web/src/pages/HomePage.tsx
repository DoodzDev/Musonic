/**
 * @file HomePage.tsx
 * @description Personalized home: quick access tiles and rotating shelves (see RMP-002 § 2).
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useState } from 'react';
import { type CardItem, type Shelf as ShelfData, type ShelfKind } from '@musonic/core';
import { QuickTile } from '../components/Card.tsx';
import { describe } from '../components/cardModel.ts';
import { PageStatus } from '../components/CollectionHeader.tsx';
import { Shelf } from '../components/Shelf.tsx';
import { useHomeFeed } from '../hooks/useHomeFeed.ts';
import { tr } from '../i18n/index.ts';

type Filter = 'all' | 'playlists' | 'albums' | 'artists';

const t = tr.home;

const SHOWN: Record<Filter, ShelfKind[]> = {
  all: ['albums', 'artists', 'songs', 'mixes'],
  playlists: ['mixes'],
  albums: ['albums'],
  artists: ['artists'],
};

function quickFor(filter: Filter, items: CardItem[]): CardItem[] {
  if (filter === 'all') return items;
  if (filter === 'playlists') return items.filter((i) => i.type === 'playlist' || i.type === 'liked');
  if (filter === 'albums') return items.filter((i) => i.type === 'album');
  return [];
}

function dayLabel(date: Date): string {
  return new Intl.DateTimeFormat(tr.locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
}

export function HomePage() {
  const [filter, setFilter] = useState<Filter>('all');
  const [today] = useState(() => new Date());
  const feed = useHomeFeed();

  if (feed.status !== 'ready') return <PageStatus status={feed.status} />;

  const quick = quickFor(filter, feed.data.quickAccess);
  const shelves: ShelfData[] = feed.data.shelves.filter((s) => SHOWN[filter].includes(s.kind));
  const empty = feed.data.quickAccess.length === 0 && feed.data.shelves.length === 0;

  return (
    <div className="page page-home">
      <header className="home-header">
        <div className="home-title">
          <span className="eyebrow">{dayLabel(today)}</span>
          <h1>{t.title}</h1>
        </div>
        <nav aria-label={t.filtersLabel} className="chips">
          {(Object.keys(t.filters) as Filter[]).map((f) => (
            <button key={f} type="button" className={'chip' + (f === filter ? ' is-on' : '')} aria-pressed={f === filter} onClick={() => setFilter(f)}>
              {t.filters[f]}
            </button>
          ))}
        </nav>
      </header>

      {empty && <p className="muted">{t.empty}</p>}

      {quick.length > 0 && (
        <section aria-label={t.quickAccess} className="quick-grid">
          {quick.map((item) => (
            <QuickTile key={describe(item).key} item={item} />
          ))}
        </section>
      )}

      {shelves.map((shelf) => (
        <Shelf key={shelf.id} title={t.shelves[shelf.id](shelf.context)} subtitle={t.subtitles[shelf.id]} items={shelf.items} />
      ))}
    </div>
  );
}
