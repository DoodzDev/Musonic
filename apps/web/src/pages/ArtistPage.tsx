/**
 * @file ArtistPage.tsx
 * @description Artist page: popular tracks, discography and similar artists.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useParams } from 'react-router';
import type { CardItem } from '@musonic/core';
import { CollectionHeader, PageStatus } from '../components/CollectionHeader.tsx';
import { Cover } from '../components/Cover.tsx';
import { Shelf } from '../components/Shelf.tsx';
import { TrackTable } from '../components/TrackTable.tsx';
import { useApp } from '../context/AppContext.tsx';
import { TTL_LONG, useCachedQuery } from '../hooks/useCachedQuery.ts';
import { tr } from '../i18n/index.ts';
import { usePlayItem, keys } from '../player/usePlayItem.ts';

const POPULAR_SHOWN = 5;

export function ArtistPage() {
  const { id = '' } = useParams();
  const { client } = useApp();
  const play = usePlayItem();
  const query = useCachedQuery(keys.artist(id), TTL_LONG, () => client.getArtist(id));
  const name = query.status === 'ready' ? query.data.name : null;
  const top = useCachedQuery(name ? keys.topSongs(name) : null, TTL_LONG, () => client.getTopSongs(name ?? '', 20));
  const info = useCachedQuery(keys.artistInfo(id), TTL_LONG, () => client.getArtistInfo(id, 12));

  if (query.status !== 'ready') return <PageStatus status={query.status} />;
  const artist = query.data;
  const albums = artist.album.slice().sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  const popular = top.status === 'ready' ? top.data.slice(0, POPULAR_SHOWN) : [];
  const similar: CardItem[] = info.status === 'ready'
    ? info.data.similarArtist.filter((a) => a.id).map((a) => ({ type: 'artist', artist: a }))
    : [];

  return (
    <div className="page">
      <CollectionHeader
        art={<Cover coverArt={artist.coverArt} fallbackCoverArt={albums[0]?.coverArt} size={208} round className="cover-hero" eager placeholder={artist.name.slice(0, 1)} />}
        eyebrow={tr.page.artist}
        title={artist.name}
        meta={tr.page.albums(artist.album.length)}
        onPlay={() => void play({ type: 'artist', artist, fallbackCoverArt: albums[0]?.coverArt })}
        canPlay={artist.album.length > 0}
      />
      {popular.length > 0 && (
        <section className="shelf">
          <header className="shelf-head"><h2>{tr.page.popular}</h2></header>
          <TrackTable songs={popular} sourceId={`artist:${artist.id}`} label={tr.page.popular} />
        </section>
      )}
      {albums.length > 0 && <Shelf title={tr.page.discography} items={albums.map((a) => ({ type: 'album', album: a }))} wrap />}
      {similar.length > 0 && <Shelf title={tr.page.similarArtists} items={similar} />}
    </div>
  );
}
