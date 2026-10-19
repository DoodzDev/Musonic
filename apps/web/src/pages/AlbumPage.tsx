/**
 * @file AlbumPage.tsx
 * @description Album page: header, tracks and more albums by the same artist.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { Link, useParams } from 'react-router';
import { CollectionHeader, PageStatus } from '../components/CollectionHeader.tsx';
import { Cover } from '../components/Cover.tsx';
import { Shelf } from '../components/Shelf.tsx';
import { TrackTable } from '../components/TrackTable.tsx';
import { useApp } from '../context/AppContext.tsx';
import { TTL_LONG, useCachedQuery } from '../hooks/useCachedQuery.ts';
import { tr } from '../i18n/index.ts';
import { formatTotal } from '../lib/format.ts';
import { usePlayer } from '../player/PlayerContext.tsx';
import { keys } from '../player/usePlayItem.ts';

export function AlbumPage() {
  const { id = '' } = useParams();
  const { client } = useApp();
  const { playSongs } = usePlayer();
  const query = useCachedQuery(keys.album(id), TTL_LONG, () => client.getAlbum(id));
  const artistId = query.status === 'ready' ? query.data.artistId : undefined;
  const artist = useCachedQuery(artistId ? keys.artist(artistId) : null, TTL_LONG, () => client.getArtist(artistId ?? ''));

  if (query.status !== 'ready') return <PageStatus status={query.status} />;
  const album = query.data;
  const source = `album:${album.id}`;
  const more = artist.status === 'ready' ? artist.data.album.filter((a) => a.id !== album.id) : [];
  const total = album.duration ?? album.song.reduce((sum, s) => sum + (s.duration ?? 0), 0);

  return (
    <div className="page">
      <CollectionHeader
        art={<Cover coverArt={album.coverArt} size={208} className="cover-hero" eager />}
        eyebrow={tr.page.album}
        title={album.name}
        meta={
          <>
            {album.artistId ? <Link to={`/artist/${album.artistId}`} className="strong link">{album.artist}</Link> : album.artist}
            {' · '}
            {tr.page.meta([album.year ? String(album.year) : undefined, tr.page.titles(album.song.length), formatTotal(total)])}
          </>
        }
        onPlay={() => playSongs(album.song, undefined, source)}
        canPlay={album.song.length > 0}
      />
      <TrackTable songs={album.song} sourceId={source} label={album.name} showAlbum={false} showCover={false} numbering="track" />
      {more.length > 0 && album.artist && (
        <Shelf title={tr.page.moreBy(album.artist)} items={more.map((a) => ({ type: 'album', album: a }))} />
      )}
    </div>
  );
}
