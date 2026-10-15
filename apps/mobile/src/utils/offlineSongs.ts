/**
 * @file offlineSongs.ts
 * @description What the library lists offline, where only downloaded tracks
 *   can play: "My music" becomes the downloaded tracks, "Liked songs" the
 *   downloaded tracks among the likes (from the copy saved on the last online
 *   visit, else from the likes known this session). Also which playlist covers
 *   must stay on the device: those of playlists holding downloaded tracks.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import type {SubsonicPlaylist, SubsonicSong} from '../api/types';
import type {DownloadedTrack} from '../store/downloadStore';

function toSong(d: DownloadedTrack): SubsonicSong {
  return {
    id: d.trackId,
    title: d.title,
    artist: d.artist,
    album: d.album,
    coverArt: d.coverArt,
    duration: d.duration,
  };
}

const byTitle = (a: SubsonicSong, b: SubsonicSong) =>
  a.title.localeCompare(b.title, undefined, {sensitivity: 'base'});

/** Every downloaded track, sorted by title. */
export function downloadedSongs(downloads: Record<string, DownloadedTrack>): SubsonicSong[] {
  return Object.values(downloads).map(toSong).sort(byTitle);
}

/**
 * Downloaded liked tracks. Keeps the order of the saved liked list (the
 * server's order) and its richer metadata; tracks liked but missing from that
 * copy (liked this session) follow, sorted by title.
 */
export function offlineLikedSongs(
  savedLiked: readonly SubsonicSong[],
  likedIds: ReadonlySet<string>,
  downloads: Record<string, DownloadedTrack>,
): SubsonicSong[] {
  const fromSaved = savedLiked.filter(s => String(s.id) in downloads);
  const seen = new Set(fromSaved.map(s => String(s.id)));
  const extra = Object.values(downloads)
    .filter(d => likedIds.has(d.trackId) && !seen.has(d.trackId))
    .map(toSong)
    .sort(byTitle);
  return [...fromSaved, ...extra];
}

/** Cover ids of the playlists that hold at least one downloaded track (their cover must work offline). */
export function playlistCoversToKeep(
  playlists: readonly SubsonicPlaylist[],
  songsByPlaylist: Record<string, readonly SubsonicSong[]>,
  downloads: Record<string, DownloadedTrack>,
): string[] {
  const keys = new Set<string>();
  for (const p of playlists) {
    if (!p.coverArt) continue;
    if ((songsByPlaylist[p.id] ?? []).some(s => String(s.id) in downloads)) keys.add(p.coverArt);
  }
  return [...keys];
}
