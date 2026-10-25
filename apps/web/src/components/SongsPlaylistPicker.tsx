/**
 * @file SongsPlaylistPicker.tsx
 * @description "Add to a playlist" for many songs at once (an album, a
 *   playlist, a mix, from its right-click menu): adds them all to the chosen
 *   playlist, or to a new one. Library songs go in one request; online songs
 *   are imported one by one, as for a single track.
 * @author DoodzProg
 * @version 0.1.0
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
import { Cover } from './Cover.tsx';
import { TextDialog } from './TextDialog.tsx';
import { CloseIcon } from './icons/CloseIcon.tsx';
import { PlusCircleIcon } from './icons/PlusCircleIcon.tsx';
import { PlusIcon } from './icons/PlusIcon.tsx';

const t = tr.trackMenu;

export function SongsPlaylistPicker({ songs, title, onClose }: { songs: Song[]; title: string; onClose: () => void }) {
  const { client } = useApp();
  const actions = usePlaylistActions();
  const playlists = useCachedQuery(keys.playlists, TTL_SHORT, () => client.getPlaylists());
  const [busy, setBusy] = useState(false);
  const [naming, setNaming] = useState(false);

  useEffect(() => {
    if (naming) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, naming]);

  const local = songs.filter((s) => !isExternalId(s.id)).map((s) => s.id);
  const online = songs.filter((s) => isExternalId(s.id));

  /** Adds every song to playlist `id`; false when something failed. */
  async function addAll(id: string): Promise<boolean> {
    let ok = local.length === 0 || (await actions.addSongs(id, local)) !== null;
    for (const song of online) ok = (await actions.addSong(id, song)) !== null && ok;
    return ok;
  }

  async function pick(id: string, name: string) {
    setBusy(true);
    const ok = await addAll(id);
    onClose();
    toast(ok ? t.addedTo(name) : tr.library.failed);
  }

  if (naming) {
    return (
      <TextDialog
        title={tr.library.newPlaylist}
        label={tr.library.newPlaylistLabel}
        initial={title}
        confirm={tr.common.create}
        onClose={() => setNaming(false)}
        onConfirm={async (name) => {
          onClose();
          const created = await actions.create(name, local);
          let ok = !!created;
          if (created) for (const song of online) ok = (await actions.addSong(created.id, song)) !== null && ok;
          toast(ok ? t.addedTo(name) : tr.library.failed);
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
            <span className="picker-song">{title} · {tr.page.titles(songs.length)}</span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={tr.common.close} title={tr.common.close}>
            <CloseIcon size={18} />
          </button>
        </div>
        <ul className="picker-list">
          <li>
            <button type="button" className="picker-row" onClick={() => setNaming(true)} disabled={busy}>
              <span className="picker-new"><PlusIcon size={22} /></span>
              <span className="item-text"><span className="item-title">{t.newPlaylist}</span></span>
            </button>
          </li>
          {playlists.status === 'loading' && <li className="muted picker-note">{tr.page.loading}</li>}
          {playlists.status === 'ready' &&
            playlists.data.map((p) => (
              <li key={p.id}>
                <button type="button" className="picker-row" onClick={() => void pick(p.id, p.name)} disabled={busy} title={t.addTo(p.name)}>
                  <Cover coverArt={p.coverArt} size={44} className="cover-44" />
                  <span className="item-text">
                    <span className="item-title">{p.name}</span>
                    <span className="item-sub">{tr.page.titles(p.songCount)}</span>
                  </span>
                  <span className="picker-state" aria-hidden="true"><PlusCircleIcon size={22} /></span>
                </button>
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}
