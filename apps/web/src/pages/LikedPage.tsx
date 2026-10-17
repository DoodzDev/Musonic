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
import { fr } from '../i18n/fr.ts';
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
        eyebrow={fr.page.playlist}
        title={fr.page.likedSongs}
        meta={fr.page.meta([session.username, fr.page.titles(songs.length), formatTotal(total)])}
        onPlay={() => playSongs(songs, undefined, 'liked')}
        canPlay={songs.length > 0}
      />
      {songs.length ? <TrackTable songs={songs} sourceId="liked" label={fr.page.likedSongs} /> : <p className="muted">{fr.page.empty}</p>}
    </div>
  );
}
