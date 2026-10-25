/**
 * @file setupPlayer.ts
 * @description Initialises react-native-track-player once per JS instance:
 *   setupPlayer, capabilities (play, pause, skip, seek) and notification /
 *   lock-screen options, the saved shuffle and repeat modes, then the
 *   playback engine restores the saved queue (also when the player was
 *   already set up by a service that kept running). Called by the app on
 *   mount and by the `MusonicAutoStart` headless task when Android Auto
 *   wakes Musonic while it is closed (ADR-015).
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import TrackPlayer, {AppKilledPlaybackBehavior, Capability, RepeatMode} from 'react-native-track-player';
import {useSettingsStore} from '../store/settingsStore';
import {usePlayerStore} from '../store/playerStore';
import {playbackEngine} from './playback/engine';

let setup: Promise<void> | null = null;

async function run(): Promise<void> {
  try {
    await TrackPlayer.setupPlayer({waitForBuffer: false});
    await TrackPlayer.updateOptions({
      android: {
        appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
      },
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
      ],
      compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext, Capability.SkipToPrevious],
      // No progressUpdateEventInterval: nothing listens to it and its native loop woke the main thread every 0.5 s.
    });
    const {shuffleMode, repeatMode} = useSettingsStore.getState();
    usePlayerStore.getState().setShuffleMode(shuffleMode);
    usePlayerStore.setState({repeatMode});
    const rnRepeat =
      repeatMode === 'all' ? RepeatMode.Queue :
      repeatMode === 'one' ? RepeatMode.Track :
      RepeatMode.Off;
    TrackPlayer.setRepeatMode(rnRepeat).catch(() => {});
  } catch (e) {
    // Already set up by a service that kept running: the engine adopts its queue.
    console.log('[TrackPlayer] setup:', e);
  }
  await playbackEngine.restore();
}

/** Sets the player up once; later calls get the same promise. */
export function setupPlayer(): Promise<void> {
  if (!setup) setup = run();
  return setup;
}
