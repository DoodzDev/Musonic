/**
 * @file useLyrics.ts
 * @description Lyrics of a track: the music server first (embedded lyrics),
 *   then LRCLIB, like the mobile app. Cached per track.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { fetchLrclibLyrics, type Song, type StructuredLyrics } from '@musonic/core';
import { useApp } from '../context/AppContext.tsx';
import { TTL_LONG, useCachedQuery, type QueryState } from '../hooks/useCachedQuery.ts';

export function useLyrics(song: Song | undefined): QueryState<StructuredLyrics | null> {
  const { client } = useApp();
  return useCachedQuery(song ? `lyrics:${song.id}` : null, TTL_LONG, async () => {
    const s = song!;
    const fromServer = await client.getLyrics({ id: s.id, artist: s.artist, title: s.title }).catch(() => null);
    if (fromServer) return fromServer;
    const found = await fetchLrclibLyrics({ artist: s.artist, title: s.title, duration: s.duration });
    // Several credited artists ("A • B"): LRCLIB usually knows the track under the main one.
    const main = s.artists?.[0]?.name;
    if (found || !main || main === s.artist) return found;
    return fetchLrclibLyrics({ artist: main, title: s.title, duration: s.duration });
  });
}
