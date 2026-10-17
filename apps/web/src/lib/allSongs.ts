/**
 * @file allSongs.ts
 * @description Every track of the library ("Ma Musique"). There is no Subsonic
 *   "all songs" call: the list is read through pages of an empty search, then
 *   sorted A → Z.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import type { Song, SubsonicClient } from '@musonic/core';

const PAGE_SIZE = 500;
const MAX_PAGES = 40;
export const MY_MUSIC_KEY = 'mymusic';

export async function loadAllSongs(client: SubsonicClient): Promise<Song[]> {
  const all: Song[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await client.search('', { songs: PAGE_SIZE, albums: 0, artists: 0 }, undefined, { songs: page * PAGE_SIZE });
    all.push(...res.song);
    if (res.song.length < PAGE_SIZE) break;
  }
  const seen = new Set<string>();
  return all
    .filter((s) => !seen.has(s.id) && !!seen.add(s.id))
    .sort((a, b) => a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' }));
}
