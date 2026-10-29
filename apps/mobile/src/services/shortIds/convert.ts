/**
 * @file convert.ts
 * @description What the app keeps, with the ids of Musonic Server's short-id
 *   form (ADR-026). Pure functions over the saved shapes, for the tests and for
 *   both moments the conversion runs (live, then at the next launch). Every
 *   function can run twice: a short id stays as it is.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {toShortId} from '@musonic/core/ids';

/** Fields that hold an id in songs, albums, artists, playlists and the app's own records. */
const ID_FIELDS = new Set(['id', 'trackId', 'albumId', 'artistId', 'coverArt', 'parent', 'playlistId']);

type Json = unknown;

/** Every id field, at any depth. Other values are left as they are. */
export function shortenFields<T extends Json>(value: T): T {
  if (Array.isArray(value)) return value.map(shortenFields) as T;
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = ID_FIELDS.has(k) && typeof v === 'string' ? toShortId(v) : shortenFields(v);
  }
  return out as T;
}

/** A record keyed by id, its keys converted (values through `map`). */
export function shortenKeys<V>(record: Record<string, V> | undefined, map: (v: V) => V = v => v): Record<string, V> {
  const out: Record<string, V> = {};
  for (const [k, v] of Object.entries(record ?? {})) out[toShortId(k)] = map(v);
  return out;
}

const ids = (list: unknown): string[] => (Array.isArray(list) ? list.map(id => toShortId(String(id))) : []);

/** Cover key of a download, as `localCovers.coverKeyOf`. */
const coverKey = (d: {coverArt?: string; trackId: string}) => d.coverArt || d.trackId;

/** Downloads, and the saved cover files to rename (`[old key, new key]`). */
export function convertDownloads<D extends {trackId: string; coverArt?: string; coverSaved?: boolean}>(
  downloads: Record<string, D> | undefined,
): {downloads: Record<string, D>; covers: [string, string][]} {
  const covers: [string, string][] = [];
  const next = shortenKeys(downloads, d => {
    const n = shortenFields(d);
    if (d.coverSaved && coverKey(d) !== coverKey(n)) covers.push([coverKey(d), coverKey(n)]);
    return n;
  });
  return {downloads: next, covers};
}

/** `musonic-settings`: only the fields that hold ids (servers keep their own ids). */
export function convertSettings<S extends Record<string, unknown>>(s: S): S {
  return {
    ...s,
    pinnedLibraryIds: ids(s.pinnedLibraryIds),
    lastPlayedPlaylists: shortenKeys(s.lastPlayedPlaylists as Record<string, number> | undefined),
  };
}

/** `musonic-playlist-cache`. */
export function convertPlaylistCache<S extends Record<string, unknown>>(s: S): S {
  return {
    ...s,
    savedTrackIds: ids(s.savedTrackIds),
    cachedPlaylists: shortenFields(s.cachedPlaylists ?? []),
    cachedPlaylistSongs: shortenKeys(s.cachedPlaylistSongs as Record<string, unknown> | undefined, shortenFields),
    cachedLikedSongs: shortenFields(s.cachedLikedSongs ?? []),
  };
}

/** `musonic-library-cache`. */
export function convertLibraryCache<S extends Record<string, unknown>>(s: S): S {
  return {
    ...shortenFields(s),
    starredAlbumIds: ids(s.starredAlbumIds),
    starredArtistIds: ids(s.starredArtistIds),
  };
}

/** A saved cover key (`pl-…`, album or song id): same rule as ids. */
export const convertCoverKey = toShortId;
