/**
 * @file usePlayButton.ts
 * @description Play / Pause of a page's main button (album, playlist, liked
 *   songs, mix…): when the current track belongs to the page's list, the
 *   button pauses and resumes it instead of starting the list again.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {useMemo} from 'react';
import {State, useActiveTrack, usePlaybackState} from 'react-native-track-player';
import {usePlayerStore} from '../store/playerStore';

export function usePlayButton(
  tracks: readonly {id: string | number}[],
  play: () => void,
): {playing: boolean; onPlay: () => void} {
  const active = useActiveTrack();
  const {state} = usePlaybackState();
  const togglePlay = usePlayerStore(s => s.togglePlay);
  const ids = useMemo(() => new Set(tracks.map(t => String(t.id))), [tracks]);
  const isThisList = active?.id != null && ids.has(String(active.id));
  return {playing: isThisList && state === State.Playing, onPlay: isThisList ? togglePlay : play};
}
