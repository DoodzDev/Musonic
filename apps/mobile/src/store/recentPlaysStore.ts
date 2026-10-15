/**
 * @file recentPlaysStore.ts
 * @description What was played lately, for the Home "Recently played" shelf
 *   (ADR-010 C1): a track launched on its own shows as that track, otherwise
 *   the album, playlist, liked songs, Magic Mix or artist that was launched.
 *   Kept on the device (names and ids only, never a URL), newest first.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {create} from 'zustand';
import {persist, createJSONStorage} from 'zustand/middleware';
import {mmkvStorage} from './storage';

export type RecentKind = 'album' | 'playlist' | 'liked' | 'library' | 'mix' | 'artist' | 'song';

export type RecentPlay = {
  kind: RecentKind;
  /** Album / playlist / artist / song id; the genre for a Magic Mix. */
  id: string;
  name: string;
  /** Artist line (album, song). */
  artist?: string;
  coverArt?: string;
  playedAt: number;
};

const MAX = 20;

/** Track fields used to describe a play (a subset of the queue `Track`). */
export type PlayedTrack = {id: string; title: string; artist?: string; album?: string; coverArt?: string};
export type PlayedSource = {type: string; id?: string; name?: string};

/**
 * What a play adds to the history, or null when it should not show (search
 * and recommendations without a start track). Pure, for the tests.
 */
export function describePlay(
  source: PlayedSource,
  tracks: readonly PlayedTrack[],
  startTrackId: string | undefined,
  now: number,
): RecentPlay | null {
  const start = (startTrackId && tracks.find(t => String(t.id) === startTrackId)) || tracks[0];
  if (!start) return null;
  switch (source.type) {
    case 'album':
      return source.id ? {kind: 'album', id: source.id, name: source.name || start.album || '', artist: start.artist, coverArt: start.coverArt, playedAt: now} : null;
    case 'playlist':
      return source.id ? {kind: 'playlist', id: source.id, name: source.name || '', coverArt: start.coverArt, playedAt: now} : null;
    case 'liked':
      return {kind: 'liked', id: 'liked', name: '', playedAt: now};
    case 'library':
      return {kind: 'library', id: 'library', name: '', playedAt: now};
    case 'mix':
      return source.id ? {kind: 'mix', id: source.id, name: source.name || source.id, coverArt: start.coverArt, playedAt: now} : null;
    case 'artist':
      return source.id ? {kind: 'artist', id: source.id, name: source.name || start.artist || '', coverArt: start.coverArt, playedAt: now} : null;
    default:
      // Search, recommendations, anything else: the track itself.
      return {kind: 'song', id: String(start.id), name: start.title, artist: start.artist, coverArt: start.coverArt, playedAt: now};
  }
}

/** Adds `play` on top, without duplicates (same kind and id), capped at MAX. */
export function pushPlay(list: readonly RecentPlay[], play: RecentPlay): RecentPlay[] {
  return [play, ...list.filter(p => !(p.kind === play.kind && p.id === play.id))].slice(0, MAX);
}

type RecentPlaysState = {
  plays: RecentPlay[];
  record: (play: RecentPlay | null) => void;
};

export const useRecentPlaysStore = create<RecentPlaysState>()(
  persist(
    set => ({
      plays: [],
      record: play => {
        if (play) set(s => ({plays: pushPlay(s.plays, play)}));
      },
    }),
    {
      name: 'musonic-recent-plays',
      storage: createJSONStorage(() => mmkvStorage),
      version: 1,
      partialize: s => ({plays: s.plays}),
    },
  ),
);
