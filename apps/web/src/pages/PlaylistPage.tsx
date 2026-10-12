/**
 * @file PlaylistPage.tsx
 * @description Playlist page: header, Play button and the track table.
 * @author DoodzProg
 * @version 0.2.0
 * @license CC-BY-NC-4.0
 */

import { useParams } from 'react-router';
import { CollectionHeader, PageStatus } from '../components/CollectionHeader.tsx';
import { Cover } from '../components/Cover.tsx';
import { TrackTable } from '../components/TrackTable.tsx';
import { useApp } from '../context/AppContext.tsx';
import { TTL_SHORT, useCachedQuery } from '../hooks/useCachedQuery.ts';
import { fr } from '../i18n/fr.ts';
import { formatTotal } from '../lib/format.ts';
import { usePlayer } from '../player/PlayerContext.tsx';
import { keys } from '../player/usePlayItem.ts';

export function PlaylistPage() {
  const { id = '' } = useParams();
  const { client } = useApp();
  const { playSongs } = usePlayer();
  const query = useCachedQuery(keys.playlist(id), TTL_SHORT, () => client.getPlaylist(id));
  if (query.status !== 'ready') return <PageStatus status={query.status} />;
  const playlist = query.data;
  const source = `playlist:${playlist.id}`;

  return (
    <div className="page">
      <CollectionHeader
        art={<Cover coverArt={playlist.coverArt} size={208} className="cover-hero" eager />}
        eyebrow={fr.page.playlist}
        title={playlist.name}
        description={playlist.comment}
        meta={fr.page.meta([playlist.owner, fr.page.titles(playlist.songCount), formatTotal(playlist.duration)])}
        onPlay={() => playSongs(playlist.entry, 0, source)}
        canPlay={playlist.entry.length > 0}
      />
      {playlist.entry.length ? (
        <TrackTable songs={playlist.entry} sourceId={source} label={playlist.name} />
      ) : (
        <p className="muted">{fr.page.empty}</p>
      )}
    </div>
  );
}
