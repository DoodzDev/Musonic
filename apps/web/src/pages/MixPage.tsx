/**
 * @file MixPage.tsx
 * @description A Magic Mix opened like a playlist: mosaic cover, title, its
 *   tracks and Play. The mix comes from the day's home feed; opened from an
 *   old link (feed of another day), the genre gets a fresh random mix.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useParams } from 'react-router';
import { mixCovers, type Song } from '@musonic/core';
import { CollectionHeader, PageStatus } from '../components/CollectionHeader.tsx';
import { Cover } from '../components/Cover.tsx';
import { TrackTable } from '../components/TrackTable.tsx';
import { useApp } from '../context/AppContext.tsx';
import { TTL_LONG, useCachedQuery } from '../hooks/useCachedQuery.ts';
import { useHomeFeed } from '../hooks/useHomeFeed.ts';
import { tr } from '../i18n/index.ts';
import { formatTotal } from '../lib/format.ts';
import { usePlayer } from '../player/PlayerContext.tsx';

export function MixPage() {
  const { genre = '' } = useParams();
  const { client } = useApp();
  const { playSongs } = usePlayer();
  const feed = useHomeFeed();
  const fromFeed =
    feed.status === 'ready'
      ? feed.data.shelves.flatMap((s) => s.items).find((i) => i.type === 'mix' && i.genre === genre)
      : undefined;
  const fallback = useCachedQuery(feed.status === 'ready' && !fromFeed ? `mix:${genre}` : null, TTL_LONG, () =>
    client.getRandomSongs({ genre, size: 30 }),
  );

  let songs: Song[] | null = null;
  if (fromFeed?.type === 'mix') songs = fromFeed.songs;
  else if (fallback.status === 'ready') songs = fallback.data;
  if (!songs) return <PageStatus status={feed.status === 'error' || fallback.status === 'error' ? 'error' : 'loading'} />;

  const source = `mix-${genre}`;
  const covers = fromFeed?.type === 'mix' ? fromFeed.covers : mixCovers(songs);
  const total = songs.reduce((sum, s) => sum + (s.duration ?? 0), 0);
  const list = songs;

  return (
    <div className="page">
      <CollectionHeader
        art={
          <span className="cover cover-hero cover-mosaic">
            {[0, 1, 2, 3].map((i) => (
              <Cover key={i} coverArt={covers[i % Math.max(1, covers.length)]} size={104} eager />
            ))}
          </span>
        }
        eyebrow={tr.card.mixSub}
        title={tr.card.mix(genre)}
        description={tr.search.mixesHint}
        meta={tr.page.meta([tr.page.titles(list.length), total ? formatTotal(total) : undefined])}
        onPlay={() => playSongs(list, undefined, source)}
        canPlay={list.length > 0}
      />
      <TrackTable songs={list} sourceId={source} label={tr.card.mix(genre)} />
    </div>
  );
}
