/**
 * @file PlaylistPage.tsx
 * @description Playlist page: header (with its description), Play button and
 *   the track table. The owner can edit the name and description, or delete it.
 * @author DoodzProg
 * @version 0.3.0
 * @license CC-BY-NC-4.0
 */

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { CollectionHeader, PageStatus } from '../components/CollectionHeader.tsx';
import { Cover } from '../components/Cover.tsx';
import { EditPlaylistDialog } from '../components/EditPlaylistDialog.tsx';
import { toast } from '../lib/toast.ts';
import { TrackTable } from '../components/TrackTable.tsx';
import { useApp } from '../context/AppContext.tsx';
import { TTL_SHORT, useCachedQuery } from '../hooks/useCachedQuery.ts';
import { tr } from '../i18n/index.ts';
import { formatTotal } from '../lib/format.ts';
import { usePlayer } from '../player/PlayerContext.tsx';
import { keys } from '../player/usePlayItem.ts';
import { usePlaylistActions } from '../player/usePlaylistActions.ts';

export function PlaylistPage() {
  const { id = '' } = useParams();
  const { client, session } = useApp();
  const { playSongs } = usePlayer();
  const actions = usePlaylistActions();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const query = useCachedQuery(keys.playlist(id), TTL_SHORT, () => client.getPlaylist(id));
  if (query.status !== 'ready') return <PageStatus status={query.status} />;
  const playlist = query.data;
  const source = `playlist:${playlist.id}`;
  // Playlists shared by another account are read-only.
  const mine = !playlist.owner || playlist.owner === session.username;

  return (
    <div className="page">
      <CollectionHeader
        art={<Cover coverArt={playlist.coverArt} size={208} className="cover-hero" eager />}
        eyebrow={tr.page.playlist}
        title={playlist.name}
        description={playlist.comment}
        meta={tr.page.meta([playlist.owner, tr.page.titles(playlist.songCount), formatTotal(playlist.duration)])}
        onPlay={() => playSongs(playlist.entry, undefined, source)}
        canPlay={playlist.entry.length > 0}
        extra={
          mine && (
            <>
              <button type="button" className="btn-quiet" onClick={() => setEditing(true)}>{tr.common.edit}</button>
              <button
                type="button"
                className="btn-quiet is-destructive"
                onClick={async () => {
                  if (!window.confirm(tr.playlist.confirmDelete(playlist.name))) return;
                  if ((await actions.remove(playlist.id)) === null) toast(tr.library.failed);
                  else {
                    toast(tr.playlist.deleted);
                    navigate('/library');
                  }
                }}>
                {tr.common.delete}
              </button>
            </>
          )
        }
      />
      {editing && (
        <EditPlaylistDialog
          name={playlist.name}
          description={playlist.comment ?? ''}
          onClose={() => setEditing(false)}
          onSave={async (changes) => {
            setEditing(false);
            toast((await actions.update(playlist.id, changes)) === null ? tr.library.failed : tr.playlist.saved);
          }}
        />
      )}
      {playlist.entry.length ? (
        <TrackTable songs={playlist.entry} sourceId={source} label={playlist.name} playlistId={playlist.id} />
      ) : (
        <p className="muted">{tr.page.empty}</p>
      )}
    </div>
  );
}
