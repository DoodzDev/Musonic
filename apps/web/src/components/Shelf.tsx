/**
 * @file Shelf.tsx
 * @description A titled row of cards. Shows one line; extra cards are hidden by the grid.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import type { ReactNode } from 'react';
import type { CardItem, Song } from '@musonic/core';
import { Card } from './Card.tsx';
import { describe } from './cardModel.ts';

interface Props {
  title: string;
  subtitle?: string;
  items: CardItem[];
  /** Wrap on several lines instead of a single row (discography). */
  wrap?: boolean;
  /** Button at the right of the title ("See all"). */
  action?: ReactNode;
  /** Special tiles before the items ("Ma Musique"). */
  leading?: ReactNode;
}

export function Shelf({ title, subtitle, items, wrap, action, leading }: Props) {
  const songs: Song[] = items.flatMap((i) => (i.type === 'song' ? [i.song] : []));
  return (
    <section className="shelf">
      <header className={'shelf-head' + (action ? ' shelf-head-row' : '')}>
        <span className="shelf-titles">
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </span>
        {action}
      </header>
      <div className={wrap ? 'shelf-grid' : 'shelf-row'}>
        {leading}
        {items.map((item) => (
          <Card key={describe(item).key} item={item} list={songs.length ? songs : undefined} />
        ))}
      </div>
    </section>
  );
}
