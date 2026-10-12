/**
 * @file search.ts
 * @description Search API endpoints. Returns Subsonic results immediately and
 *   enriches artist rows asynchronously with Deezer images (session-cached).
 *   The two operations are intentionally decoupled to keep search feel instant.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {subsonicGet, getCoverArtUrl} from '../client';
import type {SubsonicSearchResult} from '../types';

// Session-scoped Deezer image cache — keyed by artist name
const deezerCache = new Map<string, string | null>();

export async function getDeezerArtistImageCached(artistName: string): Promise<string | null> {
  if (deezerCache.has(artistName)) return deezerCache.get(artistName)!;
  try {
    const res = await fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}`);
    const json = await res.json();
    const url: string | null = json.data?.[0]?.picture_xl || json.data?.[0]?.picture_medium || null;
    deezerCache.set(artistName, url);
    return url;
  } catch {
    deezerCache.set(artistName, null);
    return null;
  }
}

export async function search(query: string): Promise<SubsonicSearchResult> {
  try {
    const res = await subsonicGet<any>('search3.view', {
      query,
      artistCount: 20,
      albumCount: 40,
      songCount: 80,
    });

    const searchData = res.searchResult3 || res.searchResult2 || res.searchResult || {};

    const seenArtists = new Set<string>();
    const artists = (searchData.artist || [])
      .filter((a: any) => {
        const id = String(a.id);
        if (seenArtists.has(id)) return false;
        seenArtists.add(id);
        return true;
      })
      .map((a: any) => ({
        ...a,
        artistImageUrl: a.coverArt ? getCoverArtUrl(a.coverArt, 300) : undefined,
      }));

    const seenAlbums = new Set<string>();
    const albums = (searchData.album || []).filter((a: any) => {
      const id = String(a.id);
      if (seenAlbums.has(id)) return false;
      seenAlbums.add(id);
      return true;
    });

    const seenSongs = new Set<string>();
    const songs = (searchData.song || []).filter((s: any) => {
      const id = String(s.id);
      if (seenSongs.has(id)) return false;
      seenSongs.add(id);
      return true;
    });

    return {artists, albums, songs};
  } catch {
    return {artists: [], albums: [], songs: []};
  }
}
