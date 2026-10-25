/**
 * @file sleepTimer.ts
 * @description Sleep timer: playback pauses after a chosen time (presets or
 *   any hours / minutes / seconds), or at the end of the current track. One
 *   timer at a time, in the JS runtime that also runs the playback service,
 *   so it fires with the screen off. Not saved: closing the app cancels it.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import TrackPlayer from 'react-native-track-player';
import {create} from 'zustand';

type SleepTimerState = {
  /** When playback pauses (ms since epoch), or null. */
  endsAt: number | null;
  /** Pause when the current track ends. */
  endOfTrack: boolean;
};

export const useSleepTimerStore = create<SleepTimerState>(() => ({endsAt: null, endOfTrack: false}));

let timer: ReturnType<typeof setTimeout> | null = null;

function clearTimer() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

/** Pauses after `seconds`, at the end of the current track (`'track'`), or cancels (`null`). */
export function setSleepTimer(choice: number | 'track' | null): void {
  clearTimer();
  if (choice === null) {
    useSleepTimerStore.setState({endsAt: null, endOfTrack: false});
    return;
  }
  if (choice === 'track') {
    useSleepTimerStore.setState({endsAt: null, endOfTrack: true});
    return;
  }
  const ms = Math.max(1, Math.round(choice)) * 1000;
  useSleepTimerStore.setState({endsAt: Date.now() + ms, endOfTrack: false});
  timer = setTimeout(() => {
    timer = null;
    useSleepTimerStore.setState({endsAt: null});
    TrackPlayer.pause().catch(() => {});
  }, ms);
}

/**
 * The playback service tells a track change: with "end of track", the next
 * track is stopped at its start and the timer ends.
 */
export function onSleepTimerTrackChanged(): void {
  if (!useSleepTimerStore.getState().endOfTrack) return;
  useSleepTimerStore.setState({endOfTrack: false});
  TrackPlayer.pause()
    .then(() => TrackPlayer.seekTo(0))
    .catch(() => {});
}

/** Whole seconds left, rounded up (at least 1). */
export function secondsLeft(endsAt: number, now = Date.now()): number {
  return Math.max(1, Math.ceil((endsAt - now) / 1000));
}
