/**
 * @file useForegroundProgress.ts
 * @description Drop-in replacement for track-player's useProgress that only
 *   polls while the app is in the foreground. useProgress keeps polling (and
 *   re-rendering) with the screen off; Fabric queues those updates and replays
 *   them all on resume, which froze the UI (ANR) after a night of playback.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {useEffect, useState} from 'react';
import {AppState} from 'react-native';
import TrackPlayer, {Event, useTrackPlayerEvents} from 'react-native-track-player';
import type {Progress} from 'react-native-track-player';

const INITIAL_STATE: Progress = {position: 0, duration: 0, buffered: 0};

export function useForegroundProgress(updateInterval = 1000): Progress {
  const [state, setState] = useState<Progress>(INITIAL_STATE);
  const [active, setActive] = useState(AppState.currentState === 'active');

  useTrackPlayerEvents([Event.PlaybackActiveTrackChanged], () => {
    setState(INITIAL_STATE);
  });

  useEffect(() => {
    const sub = AppState.addEventListener('change', next => setActive(next === 'active'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!active) return;
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const {position, duration, buffered} = await TrackPlayer.getProgress();
        if (!mounted) return;
        setState(prev =>
          position === prev.position && duration === prev.duration && buffered === prev.buffered
            ? prev
            : {position, duration, buffered},
        );
      } catch {
        // Throws only before the player is set up.
      }
      if (mounted) timer = setTimeout(poll, updateInterval);
    };

    poll();
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [active, updateInterval]);

  return state;
}
