/**
 * @file AudioPlayer.tsx
 * @description Null-render RNTP event bridge. Mounts once and shows the mini
 *   player on every track change. The queue itself is published by the
 *   playback engine, which also restores it when the app is reopened.
 * @author DoodzProg
 * @version 2.0.0
 * @license CC-BY-NC-4.0
 */
import {Event, useTrackPlayerEvents} from '../services/player';
import {usePlayerStore} from '../store/playerStore';

const SYNC_EVENTS = [Event.PlaybackActiveTrackChanged];

export default function AudioPlayer() {
  useTrackPlayerEvents(SYNC_EVENTS, event => {
    if (event.type === Event.PlaybackActiveTrackChanged && event.track) {
      usePlayerStore.getState().onTrackChanged();
    }
  });

  return null;
}
