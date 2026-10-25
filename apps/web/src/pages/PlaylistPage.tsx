/**
 * @file PlaylistPage.tsx
 * @description Playlist page: header (with its description), Play button and
 *   the track table. The owner edits it in place: name and description become
 *   fields, songs can be dragged to a new place or removed, then "Done" saves
 *   it all at once (Escape or Cancel drops the changes). The owner can also
 *   delete it. An imported playlist (Musonic Server) opens its import report.
 * @author DoodzProg
 * @version 0.5.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useState } from 'react';
import type { PlaylistImport, PlaylistWithSongs } from '@musonic/core';
import { useNavigate, useParams } from 'react-router';
import { CollectionHeader, PageStatus } from '../components/CollectionHeader.tsx';
import { Cover } from '../components/Cover.tsx';
import { PlaylistEditor, type EditItem } from '../components/PlaylistEditor.tsx';
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

/** What the edit mode changes before it is saved. */
interface Draft {
  /** Playlist being edited: opening another one leaves the edit mode. */
  id: string;
  name: string;
  comment: string;
  items: EditItem[];
}

function draftOf(playlist: PlaylistWithSongs): Draft {
  return { id: playlist.id, name: playlist.name, comment: playlist.comment ?? '', items: playlist.entry.map((song, key) => ({ key, song })) };
}

export function PlaylistPage() {
  const { id = '' } = useParams();
  const { client, session } = useApp();
  const { playSongs } = usePlayer();
  const actions = usePlaylistActions();
  const navigate = useNavigate();
  const [edited, setDraft] = useState<Draft | null>(null);
  const draft = edited?.id === id ? edited : null;
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState(false);
  const imported = useImportOf(id);
  // Escape leaves the edit mode without saving.
  useEffect(() => {
    if (!draft) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDraft(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [draft]);
  const query = useCachedQuery(keys.playlist(id), TTL_SHORT, () => client.getPlaylist(id));
  if (query.status !== 'ready') return <PageStatus status={query.status} />;
  const playlist = query.data;
  const source = `playlist:${playlist.id}`;
  // Playlists shared by another account are read-only.
  const mine = !playlist.owner || playlist.owner === session.username;

  async function save(current: Draft) {
    const name = current.name.trim();
    if (!name) {
      toast(tr.playlist.emptyName);
      return;
    }
    const ids = current.items.map((it) => it.song.id);
    const songsChanged = ids.length !== playlist.entry.length || ids.some((songId, i) => songId !== playlist.entry[i].id);
    setSaving(true);
    const done = await actions.edit(playlist.id, { name, comment: current.comment.trim(), songIds: songsChanged ? ids : undefined });
    setSaving(false);
    if (done === null) toast(tr.library.failed);
    else {
      toast(tr.playlist.saved);
      setDraft(null);
    }
  }

  return (
    <div className="page">
      <CollectionHeader
        art={<Cover coverArt={playlist.coverArt} size={208} className="cover-hero" eager />}
        eyebrow={tr.page.playlist}
        title={playlist.name}
        description={playlist.comment}
        meta={tr.page.meta([playlist.owner, tr.page.titles(playlist.songCount), formatTotal(playlist.duration)])}
        onPlay={draft ? undefined : () => playSongs(playlist.entry, undefined, source)}
        canPlay={playlist.entry.length > 0}
        edit={
          draft
            ? {
                title: draft.name,
                description: draft.comment,
                onTitle: (name) => setDraft({ ...draft, name }),
                onDescription: (comment) => setDraft({ ...draft, comment }),
                titleLabel: tr.playlist.nameLabel,
                descriptionPlaceholder: tr.playlist.descriptionPlaceholder,
              }
            : undefined
        }
        extra={
          draft ? (
            <>
              <button type="button" className="btn-primary btn-play" disabled={saving} onClick={() => save(draft)}>
                {tr.playlist.done}
              </button>
              <button type="button" className="btn-quiet" disabled={saving} onClick={() => setDraft(null)}>
                {tr.common.cancel}
              </button>
            </>
          ) : (
          mine && (
            <>
              {imported && <button type="button" className="btn-quiet" onClick={() => setReport(true)}>{tr.importPlaylist.report}</button>}
              <button type="button" className="btn-quiet" onClick={() => setDraft(draftOf(playlist))}>{tr.common.edit}</button>
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
          ))
        }
      />
      {report && imported && <ImportPlaylistDialog importId={imported.id} onClose={() => setReport(false)} />}
      {draft ? (
        <PlaylistEditor items={draft.items} onChange={(items) => setDraft({ ...draft, items })} />
      ) : playlist.entry.length ? (
        <TrackTable songs={playlist.entry} sourceId={source} label={playlist.name} playlistId={playlist.id} />
      ) : (
        <p className="muted">{tr.page.empty}</p>
      )}
    </div>
  );
}
