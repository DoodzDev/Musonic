/**
 * @file SearchPage.tsx
 * @description Search in the library. Empty field: proposals (Magic Mixes of the
 *   Home; Browse tiles: recent, most played, random, decades; the genres are
 *   in the library: the search is for discovering). While
 *   typing: All / Tracks / Albums / Artists; each list loads its next page by itself at the bottom, so a broad query
 *   ("michael") goes as far as the server has results. A track found plays
 *   alone, then autoplay follows (same rule as the mobile app, A8).
 * @author DoodzProg
 * @version 0.4.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { type Album, type Artist, type CardItem, type SearchResult, type Song } from '@musonic/core';
import { Shelf } from '../components/Shelf.tsx';
import { BROWSE_KINDS, browseKind } from '../lib/browse.ts';
import { TrackTable } from '../components/TrackTable.tsx';
import { SearchIcon } from '../components/icons/SearchIcon.tsx';
import { useApp } from '../context/AppContext.tsx';
import { TTL_SHORT, useCachedQuery } from '../hooks/useCachedQuery.ts';
import { useHomeFeed } from '../hooks/useHomeFeed.ts';
import { tr } from '../i18n/index.ts';

const t = tr.search;
type Filter = 'all' | 'songs' | 'albums' | 'artists';
const FILTERS: Filter[] = ['all', 'songs', 'albums', 'artists'];
const DEBOUNCE_MS = 250;
const PAGE = { songs: 100, albums: 50, artists: 50 };
const PREVIEW = { songs: 8, albums: 12, artists: 12 };
type Kind = keyof typeof PAGE;
const SECTION_FILTER: Record<Kind, Filter> = { songs: 'songs', albums: 'albums', artists: 'artists' };

/** Calls `onVisible` when the bottom of a list scrolls into view. */
function LoadMore({ onVisible }: { onVisible: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && onVisible(), { rootMargin: '400px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [onVisible]);
  return <div ref={ref} className="load-more" aria-hidden="true" />;
}

function Proposals() {
  const feed = useHomeFeed();
  const mixes: CardItem[] = feed.status === 'ready' ? feed.data.shelves.filter((s) => s.kind === 'mixes').flatMap((s) => s.items) : [];

  return (
    <>
      {mixes.length > 0 && <Shelf title={t.mixes} subtitle={t.mixesHint} items={mixes} />}
      <section className="shelf">
        <header className="shelf-head"><h2>{t.browse}</h2></header>
        <div className="genre-grid">
          {BROWSE_KINDS.map((kind) => (
            <Link key={kind} to={`/browse/${kind}`} className="genre-tile">
              <span className="genre-name">{browseKind(kind)?.title}</span>
              <span className="genre-count">{tr.browse.hint[kind] ?? tr.browse.decadeHint}</span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

export function SearchPage() {
  const { client } = useApp();
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get('q') ?? '');
  const [filter, setFilter] = useState<Filter>('all');
  const query = (params.get('q') ?? '').trim();
  const [more, setMore] = useState<{ query: string; songs: Song[]; albums: Album[]; artists: Artist[]; done: Record<Kind, boolean> }>(
    { query: '', songs: [], albums: [], artists: [], done: { songs: false, albums: false, artists: false } },
  );
  const loading = useRef<Kind | null>(null);

  // The URL follows what is typed (shareable, back button), after a short pause.
  useEffect(() => {
    const id = setTimeout(() => setParams(text.trim() ? { q: text.trim() } : {}, { replace: true }), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [text, setParams]);

  const first = useCachedQuery(query ? `search:${query}` : null, TTL_SHORT, () => client.search(query, PAGE));
  const base: SearchResult | null = first.status === 'ready' ? first.data : null;
  const extra = more.query === query ? more : { songs: [], albums: [], artists: [], done: { songs: false, albums: false, artists: false } };
  const lists = base && {
    songs: [...base.song, ...extra.songs],
    albums: [...base.album, ...extra.albums],
    artists: [...base.artist, ...extra.artists],
  };
  const exhausted = (kind: Kind) => !base || extra.done[kind] || (kind === 'songs' ? base.song : kind === 'albums' ? base.album : base.artist).length < PAGE[kind];

  async function loadMore(kind: Kind) {
    if (!lists || loading.current || exhausted(kind)) return;
    loading.current = kind;
    try {
      const counts = { songs: 0, albums: 0, artists: 0, [kind]: PAGE[kind] };
      const page = await client.search(query, counts, undefined, { [kind]: lists[kind].length });
      const got = kind === 'songs' ? page.song : kind === 'albums' ? page.album : page.artist;
      setMore((m) => {
        const cur = m.query === query ? m : { query, songs: [], albums: [], artists: [], done: { songs: false, albums: false, artists: false } };
        return { ...cur, query, [kind]: [...cur[kind], ...got], done: { ...cur.done, [kind]: got.length < PAGE[kind] } };
      });
    } catch {
      // Next scroll tries again.
    } finally {
      loading.current = null;
    }
  }

  const albums: CardItem[] = lists?.albums.map((album) => ({ type: 'album', album })) ?? [];
  const artists: CardItem[] = lists?.artists.map((artist) => ({ type: 'artist', artist })) ?? [];
  const nothing = lists && lists.songs.length + lists.albums.length + lists.artists.length === 0;
  const seeAll = (kind: Kind) =>
    filter === 'all' && lists && lists[kind].length > PREVIEW[kind] ? (
      <button type="button" className="see-all" onClick={() => setFilter(SECTION_FILTER[kind])}>{t.seeAll}</button>
    ) : null;

  return (
    <div className="page">
      <div className="page-heading">
        <h1 className="page-title">{t.title}</h1>
        <p className="page-subtitle">{t.discover}</p>
      </div>
      <label className="search-field">
        <SearchIcon size={20} />
        <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={t.placeholder} aria-label={t.placeholder} autoFocus />
      </label>

      {query && (
        <nav aria-label={t.filtersLabel} className="chips">
          {FILTERS.map((f) => (
            <button key={f} type="button" className={'chip' + (f === filter ? ' is-on' : '')} aria-pressed={f === filter} onClick={() => setFilter(f)}>
              {t.filters[f]}
            </button>
          ))}
        </nav>
      )}

      {!query && <Proposals />}
      {query && first.status === 'loading' && <p className="muted">{tr.page.loading}</p>}
      {query && first.status === 'error' && <p className="muted">{tr.page.error}</p>}
      {nothing && <p className="muted">{t.nothing(query)}</p>}

      {lists && (filter === 'all' || filter === 'songs') && lists.songs.length > 0 && (
        <section className="shelf">
          <header className="shelf-head shelf-head-row"><h2>{t.filters.songs}</h2>{seeAll('songs')}</header>
          <TrackTable songs={filter === 'all' ? lists.songs.slice(0, PREVIEW.songs) : lists.songs} sourceId="search" label={t.filters.songs} />
          {filter === 'songs' && !exhausted('songs') && <LoadMore onVisible={() => void loadMore('songs')} />}
        </section>
      )}
      {lists && (filter === 'all' || filter === 'albums') && albums.length > 0 && (
        <>
          <Shelf title={t.filters.albums} items={filter === 'all' ? albums.slice(0, PREVIEW.albums) : albums} wrap action={seeAll('albums')} />
          {filter === 'albums' && !exhausted('albums') && <LoadMore onVisible={() => void loadMore('albums')} />}
        </>
      )}
      {lists && (filter === 'all' || filter === 'artists') && artists.length > 0 && (
        <>
          <Shelf title={t.filters.artists} items={filter === 'all' ? artists.slice(0, PREVIEW.artists) : artists} wrap action={seeAll('artists')} />
          {filter === 'artists' && !exhausted('artists') && <LoadMore onVisible={() => void loadMore('artists')} />}
        </>
      )}
    </div>
  );
}
