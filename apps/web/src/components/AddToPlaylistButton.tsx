/**
 * @file AddToPlaylistButton.tsx
 * @description "+" / "✓" of a track row, like the mobile app: a green check
 *   when the track is already in one of the user's playlists (always visible),
 *   a "+" shown on row hover otherwise. A click opens the PlaylistPicker.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { tr } from '../i18n/index.ts';
import { CheckCircleGreenIcon } from './icons/CheckCircleGreenIcon.tsx';
import { PlusCircleIcon } from './icons/PlusCircleIcon.tsx';

interface Props {
  inPlaylist: boolean;
  onOpen: () => void;
}

export function AddToPlaylistButton({ inPlaylist, onOpen }: Props) {
  const label = inPlaylist ? tr.trackMenu.inPlaylist : tr.trackMenu.addToPlaylist;
  return (
    <button
      type="button"
      className={'icon-btn row-add' + (inPlaylist ? ' is-in' : '')}
      aria-label={label}
      title={label}
      onClick={onOpen}>
      {inPlaylist ? <CheckCircleGreenIcon size={18} /> : <PlusCircleIcon size={18} />}
    </button>
  );
}
