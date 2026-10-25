/**
 * @file NowPlayingActions.tsx
 * @description Like and "+" / "✓" (playlists) of the playing track, beside
 *   its title in the player bar and the full player.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useState } from 'react';
import type { Song } from '@musonic/core';
import { tr } from '../i18n/index.ts';
import { isLiked, usePlaylistActions } from '../player/usePlaylistActions.ts';
import { usePlaylistMembership } from '../player/usePlaylistMembership.ts';
import { colors } from '../theme/tokens.ts';
import { PlaylistPicker } from './PlaylistPicker.tsx';
import { CheckCircleGreenIcon } from './icons/CheckCircleGreenIcon.tsx';
import { HeartIcon } from './icons/HeartIcon.tsx';
import { PlusCircleIcon } from './icons/PlusCircleIcon.tsx';

interface Props {
  song: Song | undefined;
  /** Icon size: 18 in the bar, 24 in the full player. */
  size?: number;
  className?: string;
}

export function NowPlayingActions({ song, size = 18, className = 'icon-btn' }: Props) {
  const actions = usePlaylistActions();
  const membership = usePlaylistMembership();
  const [picker, setPicker] = useState(false);
  const [, setLikeRevision] = useState(0);
  const liked = song ? isLiked(song) : false;
  const inPlaylist = !!(song && membership?.get(song.id)?.size);
  const likeLabel = liked ? tr.trackMenu.unlike : tr.trackMenu.like;
  const listLabel = inPlaylist ? tr.trackMenu.inPlaylist : tr.trackMenu.addToPlaylist;

  async function toggleLike() {
    if (!song) return;
    if ((await actions.setLiked(song, !liked)) !== null) setLikeRevision((r) => r + 1);
  }

  return (
    <>
      <button type="button" className={className} onClick={toggleLike} disabled={!song} aria-label={likeLabel} aria-pressed={liked} title={likeLabel}>
        <HeartIcon size={size} filled={liked} color={liked ? colors.accent : 'currentColor'} />
      </button>
      <button type="button" className={className} onClick={() => setPicker(true)} disabled={!song} aria-label={listLabel} title={listLabel}>
        {inPlaylist ? <CheckCircleGreenIcon size={size} /> : <PlusCircleIcon size={size} />}
      </button>
      {picker && song && <PlaylistPicker song={song} onClose={() => setPicker(false)} />}
    </>
  );
}
