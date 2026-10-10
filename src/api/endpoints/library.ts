/**
 * @file library.ts
 * @description Subsonic library API endpoints: recently/frequently played albums,
 *   starred items, similar songs/artists, and star/unstar actions.
 * @author DoodzProg
 * @version 1.0.1
 * @license CC-BY-NC-4.0
 */
import {subsonicGet} from '../client';
import type {SubsonicArtist, SubsonicAlbum, SubsonicSong, SubsonicSimilarArtist} from '../types';

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
      const resp = await fetch(`https://lrclib.net/api/get?${qs}`, {
        headers: {'Lrclib-Client': 'Musonic (https://github.com/DoodzProg/Musonic)'},
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.syncedLyrics) {
          const lines = parseLrc(String(data.syncedLyrics));
          if (lines.length > 0) return {synced: true, lines};
        }
        if (data.plainLyrics) {
          const lines = (data.plainLyrics as string)
            .split('\n')
            .map((v: string) => v.trim())
            .filter(Boolean)
            .map((value: string) => ({value}));
          if (lines.length > 0) return {synced: false, lines};
        }
      }
    } catch { /* LRCLIB unreachable */ }
  }

  return null;
}
