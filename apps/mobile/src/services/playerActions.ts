/**
 * @file playerActions.ts
 * @description Imperative playback action helpers used across screens. Every list now starts through the playback engine (launchers.ts); the
 *   legacy loaders are gone. Skips always go through the engine.
 * @author DoodzProg
 * @version 2.3.0
 * @license CC-BY-NC-4.0
 */
import TrackPlayer from './player';
import {getStreamUrl, getCoverArtUrl} from '../api/client';
import {getSimilarSongs} from '../api/endpoints/library';
import {getDeezerArtistId, getDeezerArtistTopTracks} from '../api/deezer';
import {playbackBridge} from '../store/playerStore';
import {useDownloadStore} from '../store/downloadStore';
import {useSettingsStore} from '../store/settingsStore';
import type {Track} from '../store/playerStore';
import {playerArtwork} from './playerArtwork';
import {notifyJump} from './connect/jumps';

/**
 * Converts an internal Track object to an RNTP-compatible track descriptor.
 * URL resolution follows a strict priority hierarchy:
 *   1. Local file  — `file://` absolute path from the download store (offline playback).
 *   2. Navidrome   — authenticated stream URL for library-indexed tracks.
 *   3. Deezer/ext  — pre-built URL embedded in the track object for ext- tracks.
 * The artwork is a Musonic content URI: the player publishes it to other apps.
 *
 * @param t - Internal Track object from the player store.
 * @returns RNTP track object ready to be passed to TrackPlayer.add().
 */
export function toRNTPTrack(t: Track) {
  const trackId = String(t.id);
  const localPath = useDownloadStore.getState().getLocalPath(trackId);

  let url: string;
  if (localPath) {
    // Priority 1: local file available — zero buffering, works offline.
    url = `file://${localPath}`;
  } else if (!trackId.startsWith('ext-')) {
    // Priority 2: Navidrome stream — standard library track.
    url = getStreamUrl(trackId);
  } else {
    // Priority 3: Deezer-sourced track — URL embedded at track creation time.
    url = t.streamUrl ?? t.url ?? '';
  }

  return {
    id: trackId,
    url,
    title: t.title,
    artist: t.artist,
    album: t.album,
    artwork: playerArtwork(t),
    duration: t.duration,
    coverArt: t.coverArt,
    artistId: t.artistId,
    isMagic: t.isMagic,
    isAutoplay: t.isAutoplay,
  };
}

export function skipNext(): void {
  playbackBridge()?.next();
}

/** Previous: restarts the track after 3 s, unless "Previous always goes back" is on (C1). */
export async function skipPrev(): Promise<void> {
  await playbackBridge()?.previous(useSettingsStore.getState().isAlwaysPrevious);
}

export function skipPrevForce(): void {
  playbackBridge()?.previous(true);
}

export function seekTo(seconds: number): void {
  TrackPlayer.seekTo(seconds).then(notifyJump, () => {});
}

export async function fetchAutoplayTracks(
  seedTrack: Track,
  existingIds: Set<string>,
): Promise<Track[]> {
  const pool: Track[] = [];

  await Promise.allSettled([
    // Deezer top tracks for the seed artist
    (async () => {
      const artistId = await getDeezerArtistId(seedTrack.artist).catch(() => null);
      if (!artistId) return;
      const tracks = await getDeezerArtistTopTracks(artistId, 15).catch(() => []);
      for (const t of tracks) {
        const sid = `ext-deezer-song-${t.id}`;
        if (existingIds.has(sid)) continue;
        existingIds.add(sid);
        pool.push({
          id: sid,
          title: t.title,
          artist: t.artist.name,
          album: t.album.title,
          duration: t.duration,
          coverArt: sid,
          streamUrl: getStreamUrl(sid),
          url: getStreamUrl(sid),
          artwork: getCoverArtUrl(sid, 300),
          isAutoplay: true,
        });
      }
    })(),
    // Navidrome similar songs (skip for Deezer-sourced seeds)
    (async () => {
      if (seedTrack.id.startsWith('ext-')) return;
      const similar = await getSimilarSongs(seedTrack.id, 15).catch(() => []);
      for (const s of similar as any[]) {
        const sid = String(s.id);
        if (existingIds.has(sid)) continue;
        existingIds.add(sid);
        pool.push({
          id: sid,
          title: s.title,
          artist: s.artist ?? '',
          album: s.album ?? '',
          duration: s.duration ?? 0,
          coverArt: s.coverArt,
          streamUrl: getStreamUrl(sid),
          url: getStreamUrl(sid),
          artwork: getCoverArtUrl(s.coverArt ?? sid, 300),
          artistId: s.artistId ? String(s.artistId) : undefined,
          isAutoplay: true,
        });
      }
    })(),
  ]);

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 10);
}
