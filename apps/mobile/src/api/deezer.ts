/**
 * @file deezer.ts
 * @description Deezer public API helper. Metadata enrichment only — no streaming.
 *   No API key required (public endpoints). Tracks are streamed via OctoFiesta,
 *   which accepts Deezer IDs as Subsonic IDs transparently.
 * @author DoodzProg
 * @version 1.0.2
 * @license CC-BY-NC-4.0
 */

const BASE = 'https://api.deezer.com';
const TIMEOUT_MS = 8000;

// ─── Types ───────────────────────────────────────────────────────────────────

export type DeezerTrack = {
  id: number;
  title: string;
  duration: number;
  artist: {id: number; name: string; picture_medium: string};
  album: {id: number; title: string; cover_medium: string};
  isSingle?: boolean;
};

export type DeezerArtist = {
  id: number;
  name: string;
  picture_medium: string;
  picture_xl: string;
};

type DeezerAlbumDetail = {
  id: number;
  nb_tracks: number;
  record_type: string;
};

// ─── Internal fetch helper ────────────────────────────────────────────────────

async function deezerFetch<T>(path: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {signal: controller.signal});
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.error) return null;
    return data as T;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

// ─── Session caches — Promise-based so concurrent callers share one request ──

const artistCache = new Map<string, Promise<DeezerArtist | null>>();
const albumCache = new Map<number, Promise<DeezerAlbumDetail | null>>();

// Returns the first artist result for a name query, cached by lowercased name.
function searchArtist(name: string): Promise<DeezerArtist | null> {
  const key = name.toLowerCase().trim();
  if (artistCache.has(key)) return artistCache.get(key)!;
  const promise = deezerFetch<{data: DeezerArtist[]}>(
    `/search/artist?q=${encodeURIComponent(name)}`,
  ).then(data => data?.data?.[0] ?? null);
  artistCache.set(key, promise);
  return promise;
}

// ─── Artist images ────────────────────────────────────────────────────────────

export async function getArtistImage(artistName: string): Promise<string | null> {
  const artist = await searchArtist(artistName);
  return artist?.picture_xl || artist?.picture_medium || null;
}

// ─── Artist lookup ────────────────────────────────────────────────────────────

export async function getDeezerArtistId(artistName: string): Promise<number | null> {
  const artist = await searchArtist(artistName);
  return artist?.id ?? null;
}

// ─── Artist top tracks ────────────────────────────────────────────────────────

export async function getDeezerArtistTopTracks(
  artistId: number,
  limit = 10,
): Promise<DeezerTrack[]> {
  const data = await deezerFetch<{data: DeezerTrack[]}>(
    `/artist/${artistId}/top?limit=${limit}`,
  );
  return data?.data ?? [];
}

// ─── Related artists ──────────────────────────────────────────────────────────

export async function getDeezerRelatedArtists(artistId: number, limit?: number): Promise<DeezerArtist[]> {
  const data = await deezerFetch<{data: DeezerArtist[]}>(`/artist/${artistId}/related`);
  const results = data?.data ?? [];
  return limit ? results.slice(0, limit) : results;
}

// ─── Album detail (internal — used for enrichment) ────────────────────────────

async function getDeezerAlbum(albumId: number): Promise<DeezerAlbumDetail | null> {
  if (albumCache.has(albumId)) return albumCache.get(albumId)!;
  const promise = deezerFetch<DeezerAlbumDetail>(`/album/${albumId}`);
  albumCache.set(albumId, promise);
  return promise;
}

// ─── Enrich tracks with Single/Album type ─────────────────────────────────────

/**
 * Batch-fetches unique album details and annotates each track with `isSingle`.
 * A track is a single when record_type === 'single' OR the album has only 1 track.
 * Falls back to false (album behavior) on fetch failure.
 */
export async function enrichTracksWithAlbumType(
  tracks: DeezerTrack[],
): Promise<DeezerTrack[]> {
  if (tracks.length === 0) return tracks;

  const uniqueAlbumIds = [...new Set(tracks.map(t => t.album.id))];
  const results = await Promise.all(
    uniqueAlbumIds.map(id => getDeezerAlbum(id).catch(() => null)),
  );

  const albumMap = new Map<number, DeezerAlbumDetail | null>();
  uniqueAlbumIds.forEach((id, i) => albumMap.set(id, results[i]));

  return tracks.map(t => {
    const detail = albumMap.get(t.album.id);
    const isSingle = detail
      ? detail.record_type === 'single' || detail.nb_tracks === 1
      : false;
    return {...t, isSingle};
  });
}
