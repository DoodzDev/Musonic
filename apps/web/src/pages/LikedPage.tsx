/**
 * @file LikedPage.tsx
 * @description Liked songs, as a playlist-like page.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { CollectionHeader, PageStatus } from '../components/CollectionHeader.tsx';
import { LikedCover } from '../components/LikedCover.tsx';
import { TrackTable } from '../components/TrackTable.tsx';
import { useApp } from '../context/AppContext.tsx';
import { TTL_SHORT, useCachedQuery } from '../hooks/useCachedQuery.ts';
import { tr } from '../i18n/index.ts';
import { formatTotal } from '../lib/format.ts';
import { usePlayer } from '../player/PlayerContext.tsx';
import { keys } from '../player/usePlayItem.ts';

export function LikedPage() {
  const { client, session } = useApp();
  const { playSongs } = usePlayer();
  const query = useCachedQuery(keys.starred, TTL_SHORT, () => client.getStarred());
  if (query.status !== 'ready') return <PageStatus status={query.status} />;
  const songs = query.data.song;
  const total = songs.reduce((sum, s) => sum + (s.duration ?? 0), 0);

  return (
    <div className="page">
      <CollectionHeader
        art={<LikedCover size={208} className="cover-hero" />}
        eyebrow={tr.page.playlist}
        title={tr.page.likedSongs}
        meta={tr.page.meta([session.username, tr.page.titles(songs.length), formatTotal(total)])}
        onPlay={() => playSongs(songs, undefined, 'liked')}
        canPlay={songs.length > 0}
      />
      {songs.length ? <TrackTable songs={songs} sourceId="liked" label={tr.page.likedSongs} /> : <p className="muted">{tr.page.empty}</p>}
    </div>
  );
}
