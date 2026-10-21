/**
 * @file listen.ts
 * @description The console's player, to listen to a library file and check it: one for the
 *   Library (it keeps playing from the song list to a song's page, stops when leaving it),
 *   shown at the bottom.
 *   Not a music player: play, pause and choose where to listen, nothing else.
 * @author DoodzProg
 * @version 0.2.0
 * @license CC-BY-NC-4.0
 */

import { createContext, useContext } from 'react';
import { session } from './api.ts';

/** A file to listen to, and what to show while it plays. */
export interface ListenItem {
  fileId: string;
  /** Its song, for the picture. */
  trackId: string;
  title: string;
  artist: string;
}

export interface Listen {
  item: ListenItem | null;
  playing: boolean;
  /** Seconds. */
  time: number;
  duration: number;
  /** Plays `item`, or pauses / resumes it when it is the one loaded. */
  toggle: (item: ListenItem) => void;
  playPause: () => void;
  seek: (seconds: number) => void;
  close: () => void;
}

export const ListenContext = createContext<Listen | null>(null);

export function useListen(): Listen {
  const value = useContext(ListenContext);
  if (!value) throw new Error('useListen outside ListenProvider');
  return value;
}

/** The file's address (an `<audio>` cannot send a header: the session goes in it). */
export function fileUrl(fileId: string): string {
  return `/v1/admin/library/files/${encodeURIComponent(fileId)}?token=${encodeURIComponent(session.token ?? '')}`;
}

/** A song's (or album's) picture, `size` pixels wide. */
export function coverUrl(id: string, size: number): string {
  return `/v1/admin/library/covers/${encodeURIComponent(id)}?size=${size}&token=${encodeURIComponent(session.token ?? '')}`;
}
