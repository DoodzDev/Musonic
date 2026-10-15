/**
 * @file songToTrack.ts
 * @description The one mapper from a Subsonic song to a playable queue track
 *   (screens still holding their own copy move to it as they are rebuilt).
 *   Stream and artwork URLs are built in memory only: they carry credentials.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {getCoverArtUrl, getStreamUrl} from '../api/client';
import type {Track} from '../store/playerStore';

/** The fields of a song the queue needs (Subsonic songs, and the shared core's `Song`). */
export type SongLike = {
  id: string;
  title: string;
  artist?: string;
  artistId?: string;
  album?: string;
  albumId?: string;
  coverArt?: string;
  duration?: number;
};

export function songToTrack(s: SongLike): Track {
  const id = String(s.id);
  return {
    id,
    title: s.title,
    artist: s.artist ?? '',
    artistId: s.artistId,
    album: s.album ?? '',
    duration: s.duration ?? 0,
    coverArt: s.coverArt,
    streamUrl: getStreamUrl(id),
    url: getStreamUrl(id),
    artwork: getCoverArtUrl(s.coverArt || id, 300),
  };
}
