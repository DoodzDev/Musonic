/**
 * @file PlayerContext.tsx
 * @description Playback engine shared by the pages (what to play), the player
 *   bar (how to play it) and the queue panel. The queue follows the same rules
 *   as the mobile app (`@musonic/core/playback`, ADR-009).
 * @author DoodzProg
 * @version 0.3.0
 * @license CC-BY-NC-4.0
 */

import { createContext, useContext } from 'react';
import type { Song } from '@musonic/core';
import type { Modes, QueueState, QueueTrack } from '@musonic/core/playback';

export type SidePanel = 'queue' | 'lyrics' | null;

/** A song in the queue: each entry has its own id (the same song may be queued twice). */
export type WebTrack = Song & QueueTrack;

export interface PlayerContextValue {
  queue: QueueState<WebTrack>;
  modes: Modes;
  /** Identifies what is playing, e.g. `playlist:42`, to highlight it in the UI. */
  sourceId: string | null;
  current: WebTrack | undefined;
  /** Something comes after the current track (or repeat all loops back). */
  hasNext: boolean;
  /** True while audio is actually playing (drives the equalizers). */
  playing: boolean;
  setPlaying: (playing: boolean) => void;
  /** Starts a list: `startIndex` = the track clicked; none = the Play button (shuffle picks the first). */
  playSongs: (songs: Song[], startIndex: number | undefined, sourceId: string | null) => void;
  next: () => void;
  /** Returns true when the current track must restart instead (after 3 s, or nothing before). */
  previous: (positionSeconds: number) => boolean;
  /** End of the track: returns true when it must replay (repeat one). */
  trackEnded: () => boolean;
  /** Plays an entry of the queue; the tracks before it are skipped. */
  jumpTo: (entryKey: string) => void;
  addToQueue: (song: Song) => void;
  playNext: (song: Song) => void;
  remove: (entryKey: string) => void;
  clearQueue: () => void;
  cycleShuffle: () => void;
  cycleRepeat: () => void;
  /** What the right-hand panel shows. */
  panel: SidePanel;
  setPanel: (panel: SidePanel) => void;
  /** Opens `panel`, or closes it when it is already shown. */
  togglePanel: (panel: Exclude<SidePanel, null>) => void;
  /** Empties everything (logout, account change). */
  reset: () => void;
}

export const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer(): PlayerContextValue {
  const value = useContext(PlayerContext);
  if (!value) throw new Error('usePlayer must be used inside PlayerContext');
  return value;
}
