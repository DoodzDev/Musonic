/**
 * @file LikeButton.tsx
 * @description Heart of a track row, like the mobile app: filled in accent
 *   when the track is liked (always visible), empty and shown on row hover
 *   otherwise. A click likes or unlikes it.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useState } from 'react';
import type { Song } from '@musonic/core';
import { tr } from '../i18n/index.ts';
import { isLiked, usePlaylistActions } from '../player/usePlaylistActions.ts';
import { toast } from '../lib/toast.ts';
import { colors } from '../theme/tokens.ts';
import { HeartIcon } from './icons/HeartIcon.tsx';

export function LikeButton({ song }: { song: Song }) {
  const actions = usePlaylistActions();
  const [, setRevision] = useState(0);
  const liked = isLiked(song);
  const label = liked ? tr.trackMenu.unlike : tr.trackMenu.like;

  async function toggle() {
    if ((await actions.setLiked(song, !liked)) === null) {
      toast(tr.library.failed);
      return;
    }
    setRevision((r) => r + 1);
    toast(liked ? tr.trackMenu.unliked : tr.trackMenu.liked);
  }

  return (
    <button
      type="button"
      className={'icon-btn row-like' + (liked ? ' is-liked' : '')}
      onClick={toggle}
      aria-label={label}
      aria-pressed={liked}
      title={label}>
      <HeartIcon size={17} filled={liked} color={liked ? colors.accent : 'currentColor'} />
    </button>
  );
}
