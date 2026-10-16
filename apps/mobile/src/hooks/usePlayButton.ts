/**
 * @file usePlayButton.ts
 * @description Play / Pause of a page's main button (album, liked songs,
 *   mix…): when playback was started from this page's list, the button
 *   pauses and resumes it instead of starting the list again. Compared by
 *   list, not by track: a song can belong to many lists (My Music has them all).
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import {State, usePlaybackState} from 'react-native-track-player';
import {usePlayerStore} from '../store/playerStore';
import {sourceKey} from '../services/playback/engine';

export function usePlayButton(
  source: {type: string; id?: string},
  play: () => void,
): {playing: boolean; onPlay: () => void} {
  const {state} = usePlaybackState();
  const togglePlay = usePlayerStore(s => s.togglePlay);
  const isThisList = usePlayerStore(s => s.currentSourceKey === sourceKey(source));
  return {playing: isThisList && state === State.Playing, onPlay: isThisList ? togglePlay : play};
}
