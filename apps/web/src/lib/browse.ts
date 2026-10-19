/**
 * @file browse.ts
 * @description The "Browse" tiles of the search page: recently added, most
 *   played, random, and one per decade, with how to load their albums.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import type { Album, SubsonicClient } from '@musonic/core';
import { TTL_LONG, TTL_SHORT } from '../hooks/useCachedQuery.ts';
import { tr } from '../i18n/index.ts';

/** Tiles in display order: library lists, then decades. */
export const BROWSE_KINDS = ['newest', 'frequent', 'random', ...[1970, 1980, 1990, 2000, 2010, 2020].map((y) => `decade-${y}`)];

const t = tr.browse;
const SIZE = 120;

/** Title and loader of a browse kind, or null when the address is unknown. */
export function browseKind(kind: string): { title: string; load: (client: SubsonicClient) => Promise<Album[]>; ttl: number } | null {
  if (kind === 'newest') return { title: t.newest, load: (c) => c.getAlbumList('newest', { size: SIZE }), ttl: TTL_SHORT };
  if (kind === 'frequent') return { title: t.frequent, load: (c) => c.getAlbumList('frequent', { size: SIZE }), ttl: TTL_SHORT };
  if (kind === 'random') return { title: t.random, load: (c) => c.getAlbumList('random', { size: SIZE }), ttl: TTL_SHORT };
  const decade = /^decade-(\d{4})$/.exec(kind);
  if (decade) {
    const from = Number(decade[1]);
    return { title: t.decade(from), load: (c) => c.getAlbumList('byYear', { size: 500, fromYear: from, toYear: from + 9 }), ttl: TTL_LONG };
  }
  return null;
}
