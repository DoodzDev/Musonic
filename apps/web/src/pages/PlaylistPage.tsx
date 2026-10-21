/**
 * @file PlaylistPage.tsx
 * @description Playlist page: header (with its description), Play button and
 *   the track table. The owner can edit the name and description, or delete it.
 *   An imported playlist (Musonic Server) opens its import report.
 * @author DoodzProg
 * @version 0.4.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useState } from 'react';
import type { PlaylistImport } from '@musonic/core';
import { useNavigate, useParams } from 'react-router';
import { CollectionHeader, PageStatus } from '../components/CollectionHeader.tsx';
import { Cover } from '../components/Cover.tsx';
import { EditPlaylistDialog } from '../components/EditPlaylistDialog.tsx';
import { ImportPlaylistDialog } from '../components/ImportPlaylistDialog.tsx';
import { toast } from '../lib/toast.ts';
import { TrackTable } from '../components/TrackTable.tsx';
import { useApp } from '../context/AppContext.tsx';
import { TTL_SHORT, useCachedQuery } from '../hooks/useCachedQuery.ts';
import { tr } from '../i18n/index.ts';
import { formatTotal } from '../lib/format.ts';
import { isMusonicServer, v1 } from '../lib/musonicApi.ts';
import { usePlayer } from '../player/PlayerContext.tsx';
import { keys } from '../player/usePlayItem.ts';
import { usePlaylistActions } from '../player/usePlaylistActions.ts';

/** The import this playlist came from, if any. */
function useImportOf(playlistId: string): PlaylistImport | null {
  const { session } = useApp();
  const [found, setFound] = useState<PlaylistImport | null>(null);
  useEffect(() => {
    let alive = true;
    void isMusonicServer(session)
      .then((musonic) => (musonic ? v1<PlaylistImport[]>(session, '/v1/playlist-imports') : []))
      .then((all) => alive && setFound(all.find((i) => i.playlistId === playlistId) ?? null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [session, playlistId]);
  return found;
}

export function PlaylistPage() {
  const { id = '' } = useParams();
  const { client, session } = useApp();
  const { playSongs } = usePlayer();
  const actions = usePlaylistActions();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [report, setReport] = useState(false);
  const imported = useImportOf(id);
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
              {imported && <button type="button" className="btn-quiet" onClick={() => setReport(true)}>{tr.importPlaylist.report}</button>}
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
      {report && imported && <ImportPlaylistDialog importId={imported.id} onClose={() => setReport(false)} />}
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
