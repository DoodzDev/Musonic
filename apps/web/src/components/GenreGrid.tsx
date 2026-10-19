/**
 * @file GenreGrid.tsx
 * @description "Play by genre" tiles of the library: each genre of the
 *   server with its number of tracks, most filled first; opens the genre page.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { Link } from 'react-router';
import { useApp } from '../context/AppContext.tsx';
import { TTL_LONG, useCachedQuery } from '../hooks/useCachedQuery.ts';
import { tr } from '../i18n/index.ts';

export function GenreGrid() {
  const { client } = useApp();
  const genres = useCachedQuery('genres', TTL_LONG, () => client.getGenres());
  const sorted = genres.status === 'ready' ? genres.data.filter((g) => (g.songCount ?? 0) > 0).sort((a, b) => (b.songCount ?? 0) - (a.songCount ?? 0)) : [];
  if (!sorted.length) return null;

  return (
    <section className="shelf">
      <header className="shelf-head"><h2>{tr.library.byGenre}</h2></header>
      <div className="genre-grid">
        {sorted.map((g) => (
          <Link key={g.value} to={`/genre/${encodeURIComponent(g.value)}`} className="genre-tile">
            <span className="genre-name">{g.value}</span>
            <span className="genre-count">{tr.page.titles(g.songCount ?? 0)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
