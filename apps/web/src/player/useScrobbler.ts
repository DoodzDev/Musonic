/**
 * @file useScrobbler.ts
 * @description Tells the server what is played: "now playing" when a track
 *   starts, then a play once enough of it was really listened (see
 *   listenTracker in @musonic/core). Feeds "Recently played", the most played
 *   lists and the top songs. Online tracks (`ext-…`) are only reported once
 *   imported into the library: a scrobble never starts an import.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useRef } from 'react';
import { ListenTracker, resolveLibraryId, type Song } from '@musonic/core';
import { useApp } from '../context/AppContext.tsx';
import { keys } from './usePlayItem.ts';

export interface Scrobbler {
  /** Position reported by the audio element while playing. */
  progress(position: number): void;
  /** Paused or seeking. */
  interrupt(): void;
  /** Length known from the audio file. */
  setDuration(seconds: number): void;
  /** Reached the end: report the play, and count again if the track restarts. */
  ended(): void;
}

export function useScrobbler(song: Song | undefined, entry: string | undefined): Scrobbler {
  const { client, cache, session } = useApp();
  const tracker = useRef<ListenTracker | null>(null);
  const current = useRef<Song | undefined>(song);
  current.current = song;

  const report = (s: Song, submission: boolean) => {
    void resolveLibraryId(client, s, { timeoutMs: 0 })
      .then((id) => {
        if (!id) return;
        return client.scrobble(id, { submission, time: submission ? Date.now() : undefined }).then(() => {
          // The home's "Recently played" shows it on the next visit.
          if (submission) cache.invalidate(`${session.username}|${keys.home(new Date().toDateString())}`);
        });
      })
      .catch(() => {
        // Play counts are a convenience: never bother the listener with them.
      });
  };

  const submitIfDue = () => {
    const s = current.current;
    if (s && tracker.current?.takeScrobble()) report(s, true);
  };

  // A new queue entry: report the previous one if due, announce this one.
  useEffect(() => {
    const s = current.current;
    if (!s) return;
    const t = new ListenTracker(s.duration ?? 0);
    tracker.current = t;
    report(s, false);
    return () => {
      if (t.takeScrobble()) report(s, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, entry]);

  return {
    progress(position) {
      tracker.current?.progress(position);
      submitIfDue();
    },
    interrupt() {
      tracker.current?.interrupt();
    },
    setDuration(seconds) {
      if (tracker.current && seconds > 0) tracker.current.duration = seconds;
    },
    ended() {
      submitIfDue();
      // Repeat one plays the same entry again: a new listen.
      const s = current.current;
      tracker.current = new ListenTracker(tracker.current?.duration ?? s?.duration ?? 0);
    },
  };
}
