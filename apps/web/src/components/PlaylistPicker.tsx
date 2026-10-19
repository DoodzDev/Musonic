/**
 * @file PlaylistPicker.tsx
 * @description "Add to a playlist" box: the user's playlists with their cover
 *   and number of tracks; a green check marks the ones already holding the
 *   track. A click adds it, or removes it from a checked playlist. "New
 *   playlist" creates one with the track. An online track is imported into
 *   the library first. Escape or a click outside closes.
 * @author DoodzProg
 * @version 0.2.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useState } from 'react';
import { isExternalId, type Song } from '@musonic/core';
import { useApp } from '../context/AppContext.tsx';
import { TTL_SHORT, useCachedQuery } from '../hooks/useCachedQuery.ts';
import { tr } from '../i18n/index.ts';
import { toast } from '../lib/toast.ts';
import { keys } from '../player/usePlayItem.ts';
import { usePlaylistActions } from '../player/usePlaylistActions.ts';
import { usePlaylistMembership } from '../player/usePlaylistMembership.ts';
import { Cover } from './Cover.tsx';
import { TextDialog } from './TextDialog.tsx';
import { CheckCircleGreenIcon } from './icons/CheckCircleGreenIcon.tsx';
import { CloseIcon } from './icons/CloseIcon.tsx';
import { PlusCircleIcon } from './icons/PlusCircleIcon.tsx';
import { PlusIcon } from './icons/PlusIcon.tsx';

const t = tr.trackMenu;

export function PlaylistPicker({ song, onClose }: { song: Song; onClose: () => void }) {
  const { client } = useApp();
  const actions = usePlaylistActions();
  const playlists = useCachedQuery(keys.playlists, TTL_SHORT, () => client.getPlaylists());
  const membership = usePlaylistMembership();
  const [busy, setBusy] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);

  useEffect(() => {
    if (naming) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, naming]);

  async function toggle(id: string, name: string, holds: boolean) {
    setBusy(id);
    const result = holds ? await actions.removeSong(id, song.id) : await actions.addSong(id, song);
    setBusy(null);
    if (result === null) toast(tr.library.failed);
    else toast(holds ? t.removedFrom(name) : t.addedTo(name));
  }

  if (naming) {
    return (
      <TextDialog
        title={tr.library.newPlaylist}
        label={tr.library.newPlaylistLabel}
        initial={tr.library.newPlaylistDefault}
        confirm={tr.common.create}
        onClose={() => setNaming(false)}
        onConfirm={async (name) => {
          onClose();
          // An online track is added once imported, to the new (empty) playlist.
          const online = isExternalId(song.id);
          const created = await actions.create(name, online ? [] : [song.id]);
          const added = created && (!online || (await actions.addSong(created.id, song)) !== null);
          toast(added ? t.addedTo(name) : tr.library.failed);
        }}
      />
    );
  }

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog picker" role="dialog" aria-modal="true" aria-label={t.addToPlaylist}>
        <div className="dialog-head">
          <div className="picker-head">
            <h2 className="dialog-title">{t.addToPlaylist}</h2>
            <span className="picker-song">{song.title}{song.artist ? ` · ${song.artist}` : ''}</span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={tr.common.close} title={tr.common.close}>
            <CloseIcon size={18} />
          </button>
        </div>
        <ul className="picker-list">
          <li>
            <button type="button" className="picker-row" onClick={() => setNaming(true)}>
              <span className="picker-new"><PlusIcon size={22} /></span>
              <span className="item-text"><span className="item-title">{t.newPlaylist}</span></span>
            </button>
          </li>
          {playlists.status === 'loading' && <li className="muted picker-note">{tr.page.loading}</li>}
          {playlists.status === 'ready' &&
            playlists.data.map((p) => {
              const holds = !!membership?.get(song.id)?.has(p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    className={'picker-row' + (holds ? ' is-in' : '')}
                    onClick={() => void toggle(p.id, p.name, holds)}
                    disabled={busy !== null || !membership}
                    aria-pressed={holds}
                    title={holds ? t.removeFrom(p.name) : t.addTo(p.name)}>
                    <Cover coverArt={p.coverArt} size={44} className="cover-44" />
                    <span className="item-text">
                      <span className="item-title">{p.name}</span>
                      <span className="item-sub">{tr.page.titles(p.songCount)}</span>
                    </span>
                    <span className="picker-state" aria-hidden="true">
                      {holds ? <CheckCircleGreenIcon size={22} /> : <PlusCircleIcon size={22} />}
                    </span>
                  </button>
                </li>
              );
            })}
        </ul>
      </div>
    </div>
  );
}
