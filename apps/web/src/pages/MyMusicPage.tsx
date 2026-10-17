/**
 * @file MyMusicPage.tsx
 * @description "Ma Musique": every track of the library, like the mobile app (see lib/allSongs.ts).
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { PageStatus } from '../components/CollectionHeader.tsx';
import { TrackTable } from '../components/TrackTable.tsx';
import { PlayIcon } from '../components/icons/PlayIcon.tsx';
import { useApp } from '../context/AppContext.tsx';
import { TTL_LONG, useCachedQuery } from '../hooks/useCachedQuery.ts';
import { fr } from '../i18n/fr.ts';
import { loadAllSongs, MY_MUSIC_KEY } from '../lib/allSongs.ts';
import { formatTotal } from '../lib/format.ts';
import { usePlayer } from '../player/PlayerContext.tsx';

export function MyMusicPage() {
  const { client } = useApp();
  const { playSongs } = usePlayer();
  const songs = useCachedQuery(MY_MUSIC_KEY, TTL_LONG, () => loadAllSongs(client));
  if (songs.status !== 'ready') return <PageStatus status={songs.status} />;
  const total = songs.data.reduce((sum, s) => sum + (s.duration ?? 0), 0);

  return (
    <div className="page">
      <div>
        <span className="eyebrow">{fr.page.playlist}</span>
        <h1 className="page-title">{fr.library.myMusic}</h1>
        <span className="collection-stats">{fr.page.meta([fr.page.titles(songs.data.length), formatTotal(total)])}</span>
      </div>
      <div className="actions">
        <button type="button" className="btn-primary btn-play" onClick={() => playSongs(songs.data, undefined, 'mymusic')} disabled={!songs.data.length}>
          <PlayIcon size={16} color="currentColor" /> {fr.page.play}
        </button>
      </div>
      <TrackTable songs={songs.data} sourceId="mymusic" label={fr.library.myMusic} />
    </div>
  );
}
