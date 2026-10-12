/**
 * @file PlayerContext.tsx
 * @description Play queue shared by the pages (what to play) and the player bar (how to play it).
 * @author DoodzProg
 * @version 0.2.0
 * @license CC-BY-NC-4.0
 */

import { createContext, useContext } from 'react';
import type { Song } from '@musonic/core';

export interface PlayerContextValue {
  queue: Song[];
  index: number;
  /** Identifies what is playing, e.g. `playlist:42`, to highlight it in the UI. */
  sourceId: string | null;
  current: Song | undefined;
  /** True while audio is actually playing (drives the equalizers). */
  playing: boolean;
  setPlaying: (playing: boolean) => void;
  playSongs: (songs: Song[], index: number, sourceId: string | null) => void;
  setIndex: (index: number) => void;
}

export const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer(): PlayerContextValue {
  const value = useContext(PlayerContext);
  if (!value) throw new Error('usePlayer must be used inside PlayerContext');
  return value;
}
