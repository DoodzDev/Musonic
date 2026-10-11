/**
 * @file useSetupPlayer.ts
 * @description Hook that initialises react-native-track-player once on app mount:
 *   calls setupPlayer, configures capabilities (play, pause, skip, seek, like),
 *   and registers notification/lock-screen options. Then the playback engine
 *   restores the saved queue (also when the player was already set up by a
 *   service that kept running).
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import {useEffect, useRef} from 'react';
import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  RepeatMode,
} from 'react-native-track-player';
import {useSettingsStore} from '../store/settingsStore';
import {usePlayerStore} from '../store/playerStore';
import {playbackEngine} from '../services/playback/engine';

export function useSetupPlayer() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    TrackPlayer.setupPlayer({waitForBuffer: false})
      .then(() => {
        return TrackPlayer.updateOptions({
          android: {
            appKilledPlaybackBehavior:
              AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
          },
          capabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
            Capability.SeekTo,
          ],
          compactCapabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
          ],
          progressUpdateEventInterval: 0.5,
        });
      })
      .then(() => {
        const {shuffleMode, repeatMode} = useSettingsStore.getState();
        usePlayerStore.getState().setShuffleMode(shuffleMode);
        usePlayerStore.setState({repeatMode});
        const rnRepeat =
          repeatMode === 'all' ? RepeatMode.Queue :
          repeatMode === 'one' ? RepeatMode.Track :
          RepeatMode.Off;
        TrackPlayer.setRepeatMode(rnRepeat).catch(() => {});
      })
      .catch(e => console.log('[TrackPlayer] setup:', e))
      .then(() => playbackEngine.restore());
  }, []);
}
