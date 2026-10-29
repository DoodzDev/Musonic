/**
 * @file nativePlayer.ts
 * @description The native Media3 player (ADR-022) behind the calls, events and
 *   hooks of react-native-track-player the app uses, with the same names,
 *   values and payloads: the playback engine and the screens work unchanged on
 *   either player. The playback service (remote buttons, track changes) runs
 *   once the player is set up; a headless task only keeps JS timers running
 *   in the background while music plays.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import {useEffect, useRef, useState} from 'react';
import {AppRegistry, DeviceEventEmitter, NativeModules} from 'react-native';
import {
  Event,
  type AddTrack,
  type PlaybackState,
  type Progress,
  type RepeatMode,
  type ServiceHandler,
  type Track,
  type UpdateOptions,
} from 'react-native-track-player';

/** Looked up on first use: the old player never touches the native module. */
const Native = new Proxy({} as Record<string, (...args: any[]) => Promise<any>>, {
  get: (_, name: string) => NativeModules.MusonicPlayer[name],
});

/** Name of the headless task the native module starts while music plays. */
const KEEP_ALIVE_TASK = 'MusonicPlayback';

let service: ServiceHandler | null = null;
let serviceStarted = false;

function registerPlaybackService(factory: () => ServiceHandler): void {
  service = factory();
  AppRegistry.registerHeadlessTask(KEEP_ALIVE_TASK, () => () => new Promise<void>(() => {}));
}

async function setupPlayer(_options?: unknown): Promise<void> {
  await Native.setupPlayer();
  if (!serviceStarted && service) {
    serviceStarted = true;
    await service();
  }
}

function addEventListener(event: Event, listener: (payload: any) => void) {
  return DeviceEventEmitter.addListener(event, listener);
}

const TrackPlayer = {
  registerPlaybackService,
  setupPlayer,
  addEventListener,
  updateOptions: (options: UpdateOptions): Promise<void> => Native.updateOptions(options),
  add: (tracks: AddTrack | AddTrack[], insertBeforeIndex?: number): Promise<number | void> =>
    Native.add(Array.isArray(tracks) ? tracks : [tracks], insertBeforeIndex ?? -1),
  remove: (indexes: number | number[]): Promise<void> => Native.remove(Array.isArray(indexes) ? indexes : [indexes]),
  reset: (): Promise<void> => Native.reset(),
  skip: (index: number, initialPosition?: number): Promise<void> => Native.skip(index, initialPosition ?? -1),
  skipToNext: (initialPosition?: number): Promise<void> => Native.skipToNext(initialPosition ?? -1),
  play: (): Promise<void> => Native.play(),
  pause: (): Promise<void> => Native.pause(),
  seekTo: (position: number): Promise<void> => Native.seekTo(position),
  setVolume: (volume: number): Promise<void> => Native.setVolume(volume),
  setRate: (rate: number): Promise<void> => Native.setRate(rate),
  setRepeatMode: (mode: RepeatMode): Promise<void> => Native.setRepeatMode(mode),
  getActiveTrack: async (): Promise<Track | undefined> => (await Native.getActiveTrack()) ?? undefined,
  getActiveTrackIndex: async (): Promise<number | undefined> => (await Native.getActiveTrackIndex()) ?? undefined,
  getQueue: (): Promise<Track[]> => Native.getQueue(),
  getProgress: (): Promise<Progress> => Native.getProgress(),
  getPlaybackState: (): Promise<PlaybackState> => Native.getPlaybackState(),
};

export default TrackPlayer;

export function useTrackPlayerEvents(events: Event[], handler: (payload: any) => void): void {
  const saved = useRef(handler);
  saved.current = handler;
  useEffect(() => {
    const subs = events.map(type => addEventListener(type, payload => saved.current({...payload, type})));
    return () => subs.forEach(sub => sub.remove());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, events);
}

export function usePlaybackState(): PlaybackState | {state: undefined} {
  const [playbackState, setPlaybackState] = useState<PlaybackState | {state: undefined}>({state: undefined});
  useEffect(() => {
    let mounted = true;
    TrackPlayer.getPlaybackState()
      .then(fetched => {
        if (mounted) setPlaybackState(current => (current.state ? current : fetched));
      })
      .catch(() => {});
    const sub = addEventListener(Event.PlaybackState, state => setPlaybackState(state));
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return playbackState;
}

export function useActiveTrack(): Track | undefined {
  const [track, setTrack] = useState<Track | undefined>();
  useEffect(() => {
    let mounted = true;
    TrackPlayer.getActiveTrack()
      .then(initial => {
        if (mounted) setTrack(current => current ?? initial);
      })
      .catch(() => {});
    const sub = addEventListener(Event.PlaybackActiveTrackChanged, ({track: next}) => setTrack(next ?? undefined));
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return track;
}

const NO_PROGRESS: Progress = {position: 0, duration: 0, buffered: 0};

export function useProgress(updateInterval = 1000): Progress {
  const [progress, setProgress] = useState<Progress>(NO_PROGRESS);
  useEffect(() => {
    const sub = addEventListener(Event.PlaybackActiveTrackChanged, () => setProgress(NO_PROGRESS));
    let mounted = true;
    const poll = async () => {
      try {
        const next = await TrackPlayer.getProgress();
        if (!mounted) return;
        setProgress(current =>
          next.position === current.position && next.duration === current.duration && next.buffered === current.buffered
            ? current
            : next,
        );
      } catch {
        // Not set up yet.
      }
      if (mounted) setTimeout(poll, updateInterval);
    };
    poll();
    return () => {
      mounted = false;
      sub.remove();
    };
  }, [updateInterval]);
  return progress;
}
