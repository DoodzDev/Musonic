/**
 * @file launchers.ts
 * @description Screen-side helpers on top of the playback engine: start a
 *   list from its Play button or from a tapped track (tapping the track
 *   already playing opens the player instead, A9), and play an album by id.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import TrackPlayer from 'react-native-track-player';
import {getCoverArtUrl, getStreamUrl, subsonicGet} from '../../api/client';
import {usePlayerStore, type Track} from '../../store/playerStore';
import {playbackEngine} from './engine';
import type {PlaySource} from './buildQueue';

/**
 * Plays `tracks` from `source`. With `index`, starts on that track (a tap);
 * without, it is the Play button (shuffle decides the first track).
 */
export async function playFromList(source: PlaySource, tracks: Track[], index?: number): Promise<void> {
  if (tracks.length === 0) return;
  const tapped = index != null ? tracks[index] : undefined;
  if (tapped) {
    const current = await TrackPlayer.getActiveTrack().catch(() => undefined);
    if (current && String(current.id) === String(tapped.id)) {
      usePlayerStore.getState().openFullScreen();
      return;
    }
  }
  await playbackEngine.playContext({source, tracks, startTrackId: tapped ? String(tapped.id) : undefined});
}

/** Fetches an album and plays it (Home cards, singles). */
export async function playAlbumById(albumId: string): Promise<void> {
  try {
    const res = await subsonicGet<any>('getAlbum.view', {id: albumId});
    const album = res.album || {};
    const tracks: Track[] = (album.song || []).map((s: any) => ({
      id: String(s.id),
      title: s.title,
      artist: s.artist,
      artistId: s.artistId || album.artistId,
      album: s.album,
      duration: s.duration,
      coverArt: s.coverArt,
      streamUrl: getStreamUrl(s.id),
      url: getStreamUrl(s.id),
      artwork: getCoverArtUrl(s.coverArt || album.id || s.id, 600),
    }));
    await playFromList({type: 'album', id: albumId, name: album.name}, tracks);
  } catch (error) {
    console.warn('Album playback error:', error);
  }
}
