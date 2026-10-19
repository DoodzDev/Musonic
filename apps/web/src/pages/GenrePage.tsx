/**
 * @file GenrePage.tsx
 * @description The tracks of one genre (opened from the search proposals), with Play.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useParams } from 'react-router';
import { PageStatus } from '../components/CollectionHeader.tsx';
import { TrackTable } from '../components/TrackTable.tsx';
import { PlayIcon } from '../components/icons/PlayIcon.tsx';
import { useApp } from '../context/AppContext.tsx';
import { TTL_LONG, useCachedQuery } from '../hooks/useCachedQuery.ts';
import { tr } from '../i18n/index.ts';
import { usePlayer } from '../player/PlayerContext.tsx';

export function GenrePage() {
  const { name = '' } = useParams();
  const { client } = useApp();
  const { playSongs } = usePlayer();
  const songs = useCachedQuery(`genre:${name}`, TTL_LONG, () => client.getSongsByGenre(name, 500));
  if (songs.status !== 'ready') return <PageStatus status={songs.status} />;
  const source = `mix:genre:${name}`;

  return (
    <div className="page">
      <div className="page-title-row">
        <div>
          <span className="eyebrow">{tr.search.genre}</span>
          <h1 className="page-title">{name}</h1>
          <span className="collection-stats">{tr.page.titles(songs.data.length)}</span>
        </div>
      </div>
      <div className="actions">
        <button type="button" className="btn-primary btn-play" onClick={() => playSongs(songs.data, undefined, source)} disabled={!songs.data.length}>
          <PlayIcon size={16} color="currentColor" /> {tr.page.play}
        </button>
      </div>
      <TrackTable songs={songs.data} sourceId={source} label={name} />
    </div>
  );
}
