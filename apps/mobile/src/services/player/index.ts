/**
 * @file index.ts
 * @description The app's player: react-native-track-player, or the native
 *   Media3 player when it is chosen (ADR-022, `mode.ts`). Same calls, events,
 *   hooks and constants either way; the whole app imports them from here.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import RNTP, {
  useActiveTrack as rntpUseActiveTrack,
  usePlaybackState as rntpUsePlaybackState,
  useProgress as rntpUseProgress,
  useTrackPlayerEvents as rntpUseTrackPlayerEvents,
} from 'react-native-track-player';
import NativePlayer, * as native from './nativePlayer';
import {usesNativePlayer} from './mode';

export {AppKilledPlaybackBehavior, Capability, Event, RepeatMode, State} from 'react-native-track-player';
export type {AddTrack, PlaybackState, Progress, Track} from 'react-native-track-player';

const TrackPlayer: typeof RNTP = usesNativePlayer ? (NativePlayer as unknown as typeof RNTP) : RNTP;
export default TrackPlayer;

export const useActiveTrack: typeof rntpUseActiveTrack = usesNativePlayer ? native.useActiveTrack : rntpUseActiveTrack;
export const usePlaybackState: typeof rntpUsePlaybackState = usesNativePlayer
  ? native.usePlaybackState
  : rntpUsePlaybackState;
export const useProgress: typeof rntpUseProgress = usesNativePlayer ? native.useProgress : rntpUseProgress;
export const useTrackPlayerEvents: typeof rntpUseTrackPlayerEvents = usesNativePlayer
  ? (native.useTrackPlayerEvents as typeof rntpUseTrackPlayerEvents)
  : rntpUseTrackPlayerEvents;
