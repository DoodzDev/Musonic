/**
 * @file launchers.ts
 * @description Screen-side helpers on top of the playback engine: start a
 *   list from its Play button or from a tapped track (tapping the track
 *   already playing opens the player instead, A9), play an album by id, and
 *   add one song to the end of the queue (swipe right on a row).
 * @author DoodzProg
 * @version 1.2.0
 * @license CC-BY-NC-4.0
 */
import TrackPlayer from '../player';
import {getCoverArtUrl, getStreamUrl, subsonicGet} from '../../api/client';
import {usePlayerStore, type Track} from '../../store/playerStore';
import {playbackEngine} from './engine';
import type {PlaySource} from './buildQueue';
import {songToTrack, type SongLike} from '../../utils/songToTrack';
import {toast} from '../../components/ui/Toast';
import {getT} from '../../i18n';
import {getPlaylist} from '../../api/endpoints/playlists';
import {getStarred} from '../../api/endpoints/library';
import {usePlaylistCacheStore} from '../../store/playlistCacheStore';

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

/** Fetches a playlist and plays it from the start (play button of the Home cards). */
export async function playPlaylistById(playlistId: string): Promise<void> {
  try {
    const {playlist, songs} = await getPlaylist(playlistId);
    await playFromList({type: 'playlist', id: playlistId, name: playlist.name}, songs.map(songToTrack));
  } catch (error) {
    console.warn('Playlist playback error:', error);
  }
}

/** Plays the liked songs from the start (play button of the Home card); the cached list offline. */
export async function playLikedSongs(): Promise<void> {
  try {
    const songs = await getStarred()
      .then(d => d.songs)
      .catch(() => usePlaylistCacheStore.getState().cachedLikedSongs);
    if (songs.length) await playFromList({type: 'liked'}, songs.map(songToTrack));
  } catch (error) {
    console.warn('Liked songs playback error:', error);
  }
}

/** Adds one song after everything already added by the user (D2: A, B, C play in that order). */
export async function addSongToQueue(song: SongLike): Promise<void> {
  await playbackEngine.addToQueue([songToTrack(song)]);
  toast.success(getT().ui.addedToQueue(song.title));
}
