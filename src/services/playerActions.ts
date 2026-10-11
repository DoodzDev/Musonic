/**
 * @file playerActions.ts
 * @description Imperative playback action helpers used across screens. All
 *   queue-loading functions resolve `currentPlaylistId` so the orange active-track
 *   indicator in PlaylistDetail stays accurate regardless of play context.
 *   Legacy loaders hand the player back from the playback engine; skips go
 *   through the engine while it drives the player.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import TrackPlayer from 'react-native-track-player';
import {getPlaylist} from '../api/endpoints/playlists';
import {getStreamUrl, getCoverArtUrl, subsonicGet} from '../api/client';
import {getSimilarSongs} from '../api/endpoints/library';
import {getDeezerArtistId, getDeezerArtistTopTracks} from '../api/deezer';
import {activeEngine, usePlayerStore} from '../store/playerStore';
import {useDownloadStore} from '../store/downloadStore';
import type {Track} from '../store/playerStore';

export function fisherYates(arr: Track[]): Track[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Converts an internal Track object to an RNTP-compatible track descriptor.
 * URL resolution follows a strict priority hierarchy:
 *   1. Local file  — `file://` absolute path from the download store (offline playback).
 *   2. Navidrome   — authenticated stream URL for library-indexed tracks.
 *   3. Deezer/ext  — pre-built URL embedded in the track object for ext- tracks.
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
    artwork: t.artwork ?? '',
    duration: t.duration,
    coverArt: t.coverArt,
    artistId: t.artistId,
    isMagic: t.isMagic,
    isAutoplay: t.isAutoplay,
  };
}

export async function loadAndPlayPlaylist(
  playlistId: string,
  startRandom = false,
): Promise<void> {
  const data = await getPlaylist(playlistId);
  const songs = data.songs || [];
  const playlistName = data.playlist?.name || 'Playlist';

  if (songs.length === 0) return;
  activeEngine()?.detach();

  const tracks: Track[] = songs.map(s => ({
    id: s.id,
    title: s.title,
    artist: s.artist,
    artistId: s.artistId,
    album: s.album,
    duration: s.duration,
    coverArt: s.coverArt,
    streamUrl: getStreamUrl(s.id),
    url: getStreamUrl(s.id),
    artwork: getCoverArtUrl(s.coverArt || s.albumId || s.id, 600),
  }));

  const ordered = startRandom ? fisherYates(tracks) : tracks;

  const store = usePlayerStore.getState();
  store.setCurrentPlaylist(playlistId, playlistName);
  store.setOriginalQueue(tracks);
  store.setQueue(ordered);
  store.setHistory([]);
  store.setUpcoming(ordered.slice(1));

  await TrackPlayer.reset();
  await TrackPlayer.add([toRNTPTrack(ordered[0])]);
  await TrackPlayer.play();
  if (ordered.length > 1) {
    TrackPlayer.add(ordered.slice(1).map(toRNTPTrack))
      .then(() => syncUpcomingFromRNTP())
      .catch(() => {});
  }
}

export async function loadAndPlayAlbum(
  albumId: string,
  startRandom = false,
): Promise<void> {
  try {
    const res = await subsonicGet<any>('getAlbum.view', {id: albumId});
    const album = res.album || {};
    const songs = album.song || [];

    if (songs.length === 0) return;
    activeEngine()?.detach();

    const tracks: Track[] = songs.map((s: any) => ({
      id: s.id,
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

    const ordered = startRandom ? fisherYates(tracks) : tracks;

    const store = usePlayerStore.getState();
    store.setCurrentPlaylist(null, null);
    store.setOriginalQueue(tracks);
    store.setQueue(ordered);
    store.setHistory([]);
    store.setUpcoming(ordered.slice(1));

    await TrackPlayer.reset();
    await TrackPlayer.add([toRNTPTrack(ordered[0])]);
    await TrackPlayer.play();
    if (ordered.length > 1) {
      TrackPlayer.add(ordered.slice(1).map(toRNTPTrack))
        .then(() => syncUpcomingFromRNTP())
        .catch(() => {});
    }
  } catch (error) {
    console.warn('Album playback error:', error);
  }
}

export function playTrack(track: Track): void {
  activeEngine()?.detach();
  const store = usePlayerStore.getState();
  store.setCurrentPlaylist(null, null);
  store.setOriginalQueue([track]);
  store.setQueue([track]);
  store.setHistory([]);
  store.setUpcoming([]);

  TrackPlayer.reset()
    .then(() => TrackPlayer.add([toRNTPTrack(track)]))
    .then(() => TrackPlayer.play())
    .catch(e => console.log('[TrackPlayer] playTrack:', e));
}

export async function loadAndPlayTracks(
  tracks: Track[],
  startIndex: number = 0,
  playlistContext?: {id: string; name: string},
): Promise<void> {
  if (tracks.length === 0) return;
  activeEngine()?.detach();
  const idx = Math.max(0, Math.min(startIndex, tracks.length - 1));
  const store = usePlayerStore.getState();
  // Always resolve playlist context: set provided one, or clear it.
  // This prevents orange-highlight bleed when playing from a non-playlist context
  // (album, liked songs, search) while a playlist screen is still visible.
  store.setCurrentPlaylist(playlistContext?.id ?? null, playlistContext?.name ?? null);
  store.setOriginalQueue(tracks);
  store.setQueue(tracks);
  store.setHistory(tracks.slice(0, idx));
  store.setUpcoming(tracks.slice(idx + 1));
  await TrackPlayer.reset();
  await TrackPlayer.add([toRNTPTrack(tracks[idx])]);
  await TrackPlayer.play();
  (async () => {
    if (idx > 0) {
      await TrackPlayer.add(tracks.slice(0, idx).map(toRNTPTrack), 0);
    }
    if (idx < tracks.length - 1) {
      await TrackPlayer.add(tracks.slice(idx + 1).map(toRNTPTrack));
    }
    await syncUpcomingFromRNTP();
  })().catch(() => {});
}

export function skipNext(): void {
  const engine = activeEngine();
  if (engine) {
    engine.next();
    return;
  }
  TrackPlayer.skipToNext().catch(() => {});
}

export async function skipPrev(): Promise<void> {
  const engine = activeEngine();
  if (engine) return engine.previous(false);
  const position = await TrackPlayer.getPosition();
  if (position > 3) {
    TrackPlayer.seekTo(0);
  } else {
    TrackPlayer.skipToPrevious().catch(() => {});
  }
}

export function skipPrevForce(): void {
  const engine = activeEngine();
  if (engine) {
    engine.previous(true);
    return;
  }
  TrackPlayer.skipToPrevious().catch(() => {});
}

export function seekTo(seconds: number): void {
  TrackPlayer.seekTo(seconds);
}

export async function syncUpcomingFromRNTP(): Promise<void> {
  try {
    const [queue, activeIdx] = await Promise.all([
      TrackPlayer.getQueue(),
      TrackPlayer.getActiveTrackIndex(),
    ]);
    if (activeIdx == null) return;
    const toT = (t: any): Track => ({
      id: String(t.id),
      title: String(t.title ?? ''),
      artist: String(t.artist ?? ''),
      album: String(t.album ?? ''),
      duration: Number(t.duration ?? 0),
      coverArt: t.coverArt ? String(t.coverArt) : undefined,
      url: String(t.url ?? ''),
      artwork: t.artwork ? String(t.artwork) : undefined,
      isMagic: (t as any).isMagic ? true : undefined,
      isAutoplay: (t as any).isAutoplay ? true : undefined,
    });
    const store = usePlayerStore.getState();
    const after = queue.slice(activeIdx + 1).map(toT);
    const upcoming = store.repeatMode === 'all'
      ? [...after, ...queue.slice(0, activeIdx).map(toT)]
      : after;
    store.setUpcoming(upcoming);
  } catch {}
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
