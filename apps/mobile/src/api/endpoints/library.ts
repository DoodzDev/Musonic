/**
 * @file library.ts
 * @description Subsonic library API endpoints: recently/frequently played albums,
 *   starred items, similar songs/artists, genres, and star/unstar actions.
 * @author DoodzProg
 * @version 1.2.0
 * @license CC-BY-NC-4.0
 */
import {subsonicGet} from '../client';
import type {SubsonicArtist, SubsonicAlbum, SubsonicSong, SubsonicSimilarArtist} from '../types';

export async function getSong(id: string): Promise<SubsonicSong | null> {
  const res = await subsonicGet<any>('getSong.view', {id});
  return res.song ?? null;
}

export async function getArtists(): Promise<SubsonicArtist[]> {
  const res = await subsonicGet<any>('getArtists.view');
  const indexes = res.artists?.index ?? [];
  return indexes.flatMap((i: any) => i.artist ?? []);
}

export async function getAlbumsByArtist(artistId: string): Promise<SubsonicAlbum[]> {
  const res = await subsonicGet<any>('getArtist.view', {id: artistId});
  return res.artist?.album ?? [];
}

export async function getAlbum(albumId: string): Promise<{album: SubsonicAlbum; songs: SubsonicSong[]}> {
  const res = await subsonicGet<any>('getAlbum.view', {id: albumId});
  return {album: res.album, songs: res.album?.song ?? []};
}

export async function getRecentAlbums(size = 20): Promise<SubsonicAlbum[]> {
  const res = await subsonicGet<any>('getAlbumList2.view', {type: 'recent', size});
  return res.albumList2?.album ?? [];
}

export async function getNewestAlbums(size = 20): Promise<SubsonicAlbum[]> {
  const res = await subsonicGet<any>('getAlbumList2.view', {type: 'newest', size});
  return res.albumList2?.album ?? [];
}

export async function getFrequentAlbums(size = 20): Promise<SubsonicAlbum[]> {
  const res = await subsonicGet<any>('getAlbumList2.view', {type: 'frequent', size});
  return res.albumList2?.album ?? [];
}

export async function getStarred(): Promise<{songs: SubsonicSong[]; albums: SubsonicAlbum[]; artists: SubsonicArtist[]}> {
  const res = await subsonicGet<any>('getStarred2.view');
  return {
    songs: res.starred2?.song ?? [],
    albums: res.starred2?.album ?? [],
    artists: res.starred2?.artist ?? [],
  };
}

export async function star(id: string) {
  await subsonicGet('star.view', {id});
}

export async function unstar(id: string) {
  await subsonicGet('unstar.view', {id});
}

export async function getRandomSongs(size = 10): Promise<SubsonicSong[]> {
  const res = await subsonicGet<any>('getRandomSongs.view', {size});
  return res.randomSongs?.song ?? [];
}

export type SubsonicGenre = {value: string; songCount: number; albumCount: number};

/** Genres of the library, the largest first. */
export async function getGenres(): Promise<SubsonicGenre[]> {
  const res = await subsonicGet<any>('getGenres.view');
  const genres: SubsonicGenre[] = res.genres?.genre ?? [];
  return genres.filter(g => g.value && g.songCount > 0).sort((a, b) => b.songCount - a.songCount);
}

/** Songs of a genre (Subsonic caps a page at 500). */
export async function getSongsByGenre(genre: string, count = 500): Promise<SubsonicSong[]> {
  const res = await subsonicGet<any>('getSongsByGenre.view', {genre, count});
  return res.songsByGenre?.song ?? [];
}

export async function getSimilarSongs(id: string, count = 20): Promise<SubsonicSong[]> {
  const res = await subsonicGet<any>('getSimilarSongs2.view', {id, count});
  return res.similarSongs2?.song ?? [];
}

export async function getSimilarArtists(artistId: string, count = 20): Promise<SubsonicSimilarArtist[]> {
  const res = await subsonicGet<any>('getArtistInfo2.view', {id: artistId, count});
  return res.artistInfo2?.similarArtist ?? [];
}

// ─── Lyrics ───────────────────────────────────────────────────────────────────

export type LyricLine = {start?: number; value: string};
export type LyricsData = {synced: boolean; lines: LyricLine[]} | null;

// Parses LRC format "[mm:ss.xx] text" into timestamped lines.
export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of lrc.split('\n')) {
    const m = raw.match(/^\[(\d{1,2}):(\d{2})\.(\d{2,3})\](.*)/);
    if (!m) continue;
    const ms = (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) * 1000
              + parseInt(m[3].padEnd(3, '0'), 10);
    const value = m[4].trim();
    if (value) lines.push({start: ms, value});
  }
  return lines;
}

const LRCLIB_HEADERS = {
  // LRCLIB sits behind Cloudflare, which rejects the default OkHttp User-Agent (HTTP 520).
  'User-Agent': 'Musonic (https://github.com/DoodzDev/Musonic)',
  'Lrclib-Client': 'Musonic (https://github.com/DoodzDev/Musonic)',
};
const LRCLIB_DURATION_TOLERANCE_S = 3;

function toPlainLines(text: string): LyricLine[] {
  return text
    .split('\n')
    .map(v => v.trim())
    .filter(Boolean)
    .map(value => ({value}));
}

// LRCLIB's /api/get returns a single best match, which is sometimes a plain-only
// release while other releases of the same track have synced lyrics. Search them
// and keep the synced one whose duration is closest to the track's.
async function searchLrclibSynced(
  artistName: string,
  trackTitle: string,
  duration?: number,
): Promise<LyricLine[] | null> {
  const qs = new URLSearchParams({artist_name: artistName, track_name: trackTitle});
  const resp = await fetch(`https://lrclib.net/api/search?${qs}`, {headers: LRCLIB_HEADERS});
  if (!resp.ok) return null;
  const results: any[] = await resp.json();
  const candidates = results.filter(r =>
    r.syncedLyrics &&
    (duration == null || Math.abs(Number(r.duration) - duration) <= LRCLIB_DURATION_TOLERANCE_S),
  );
  if (duration != null) {
    candidates.sort((a, b) => Math.abs(a.duration - duration) - Math.abs(b.duration - duration));
  }
  for (const c of candidates) {
    const lines = parseLrc(String(c.syncedLyrics));
    if (lines.length > 0) return lines;
  }
  return null;
}

export async function getLyricsBySongId(
  songId: string,
  artistName?: string,
  trackTitle?: string,
  duration?: number,
): Promise<LyricsData> {
  // 1. OpenSubsonic getLyricsBySongId (synced LRC when embedded in file)
  try {
    const res = await subsonicGet<any>('getLyricsBySongId.view', {id: songId});
    const structured: any[] = res.lyricsList?.structuredLyrics ?? [];
    if (structured.length > 0) {
      const best = structured.find((s: any) => s.synced) ?? structured[0];
      const lines: LyricLine[] = (best.line ?? [])
        .filter((l: any) => typeof l.value === 'string' && l.value.trim())
        .map((l: any) => ({start: l.start as number | undefined, value: String(l.value)}));
      if (lines.length > 0) return {synced: !!best.synced, lines};
    }
  } catch { /* fall through */ }

  // 2. Legacy Subsonic getLyrics (plain text fallback)
  if (artistName && trackTitle) {
    try {
      const res = await subsonicGet<any>('getLyrics.view', {
        artist: artistName,
        title: trackTitle,
      });
      const text: string = res.lyrics?.value ?? '';
      if (text.trim()) {
        const lines: LyricLine[] = text
          .split('\n')
          .map((v: string) => v.trim())
          .filter(Boolean)
          .map((value: string) => ({value}));
        if (lines.length > 0) return {synced: false, lines};
      }
    } catch { /* fall through */ }
  }

  // 3. LRCLIB public API — synced LRC preferred, plain text fallback
  if (artistName && trackTitle) {
    try {
      const qs = new URLSearchParams({
        artist_name: artistName,
        track_name: trackTitle,
        ...(duration != null ? {duration: String(Math.round(duration))} : {}),
      });
      const resp = await fetch(`https://lrclib.net/api/get?${qs}`, {headers: LRCLIB_HEADERS});
      let plainLines: LyricLine[] = [];
      if (resp.ok) {
        const data = await resp.json();
        if (data.syncedLyrics) {
          const lines = parseLrc(String(data.syncedLyrics));
          if (lines.length > 0) return {synced: true, lines};
        }
        if (data.plainLyrics) plainLines = toPlainLines(String(data.plainLyrics));
      }
      const syncedLines = await searchLrclibSynced(artistName, trackTitle, duration);
      if (syncedLines) return {synced: true, lines: syncedLines};
      if (plainLines.length > 0) return {synced: false, lines: plainLines};
    } catch { /* LRCLIB unreachable */ }
  }

  return null;
}
