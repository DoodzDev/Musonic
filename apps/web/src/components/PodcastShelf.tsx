/**
 * @file PodcastShelf.tsx
 * @description Podcast shows as cards (ADR-023): found in the directory (its
 *   picture, the show is not on the server yet) or followed (the server's).
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Cover } from './Cover.tsx';

export interface ShowCard {
  id: string;
  title: string;
  subtitle?: string;
  /** Opens it through its feed (a show found in the directory). */
  feedUrl?: string;
  /** The directory's picture; else the server's cover. */
  imageUrl?: string;
  coverArt?: string;
}

export function PodcastShelf({ title, shows, action }: { title: string; shows: ShowCard[]; action?: ReactNode }) {
  return (
    <section className="shelf">
      <header className={'shelf-head' + (action ? ' shelf-head-row' : '')}>
        <span className="shelf-titles"><h2>{title}</h2></span>
        {action}
      </header>
      <div className="shelf-grid">
        {shows.map((show) => (
          <div key={show.id} className="card">
            <Link to={`/podcast/${show.id}${show.feedUrl ? `?feed=${encodeURIComponent(show.feedUrl)}` : ''}`} className="card-link">
              <span className="card-art">
                {show.imageUrl ? (
                  <span className="cover"><img src={show.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /></span>
                ) : (
                  <Cover coverArt={show.coverArt} size={180} />
                )}
              </span>
              <span className="card-text">
                <span className="card-title">{show.title}</span>
                {show.subtitle && <span className="card-sub">{show.subtitle}</span>}
              </span>
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
