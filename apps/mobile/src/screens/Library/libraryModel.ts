/**
 * @file libraryModel.ts
 * @description Pure data side of the Library (R5.3): the entries of each tab,
 *   the albums list (starred albums, then those of liked songs), the artists
 *   list built from starred artists, starred albums and liked songs, and
 *   the sort with pinned entries on top. No React, for the tests.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import type {SubsonicAlbum, SubsonicArtist, SubsonicSong} from '../../api/types';
import type {LibrarySortMode} from '../../store/settingsStore';

export type LibraryTab = 'playlists' | 'albums' | 'artists' | 'downloads';

export type LibraryEntry = {
  kind: 'playlist' | 'album' | 'artist';
  id: string;
  name: string;
  /** Album artist. */
  artist?: string;
  songCount?: number;
  coverId?: string;
  /** Playlists: downloaded tracks, out of `downloadable` (non-online tracks). */
  downloaded?: number;
  downloadable?: number;
};

/**
 * Cover of an artist met on an album or a song: that album's cover, already
 * cached (the server gives its own artists their latest album's). Not every
 * server knows `ar-<id>`, so it is never guessed; online artists get none.
 */
function artistCoverId(artistId: string, itemCover: string | undefined): string | undefined {
  return artistId.startsWith('ext-') ? undefined : itemCover;
}

/**
 * Artists credited on a song or album, one by one. The server joins several
 * artists in `artist` ("Lil Nas X • Billy Ray Cyrus") with the id of the
 * first one: use its `artists` list when it gives one, else the first name
 * with `artistId`. Names joined with "&" are kept whole: they are often one
 * act ("Bigflo & Oli").
 */
export function creditedArtists(item: {artist?: string; artistId?: string; artists?: readonly {id: string; name: string}[]}): {id: string; name: string}[] {
  const listed = (item.artists ?? []).filter(a => a.id && a.name);
  if (listed.length > 0) return listed;
  if (!item.artistId || !item.artist) return [];
  const first = item.artist.split('•')[0].trim();
  return first ? [{id: item.artistId, name: first}] : [];
}

/**
 * Artists of the Library: the starred ones first, then the artists of
 * starred albums and liked songs, most present first. One entry per artist,
 * a song with several artists counting for each of them.
 */
export function collectArtists(
  starred: readonly SubsonicArtist[],
  albums: readonly SubsonicAlbum[],
  songs: readonly SubsonicSong[],
): SubsonicArtist[] {
  const out: SubsonicArtist[] = [];
  const seen = new Set<string>();
  for (const a of starred) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    out.push(a);
  }
  const counts = new Map<string, {artist: SubsonicArtist; n: number; first: number}>();
  const add = (id: string | undefined, name: string | undefined, cover: string | undefined) => {
    if (!id || !name || seen.has(id)) return;
    const hit = counts.get(id);
    if (hit) {
      hit.n += 1;
      hit.artist.coverArt ??= artistCoverId(id, cover);
    } else counts.set(id, {artist: {id, name, coverArt: artistCoverId(id, cover)}, n: 1, first: counts.size});
  };
  for (const item of [...albums, ...songs]) {
    for (const a of creditedArtists(item)) add(a.id, a.name, item.coverArt);
  }
  const rest = [...counts.values()].sort((a, b) => b.n - a.n || a.first - b.first);
  return [...out, ...rest.map(r => r.artist)];
}

/**
 * Albums of the Library: the starred ones first, then the albums of liked
 * songs, the most liked first. One entry per album.
 */
export function collectAlbums(starred: readonly SubsonicAlbum[], songs: readonly SubsonicSong[]): SubsonicAlbum[] {
  const seen = new Set(starred.map(a => a.id));
  const counts = new Map<string, {album: SubsonicAlbum; n: number; first: number}>();
  for (const s of songs) {
    if (!s.albumId || !s.album || seen.has(s.albumId)) continue;
    const hit = counts.get(s.albumId);
    if (hit) {
      hit.n += 1;
      continue;
    }
    counts.set(s.albumId, {
      album: {id: s.albumId, name: s.album, artist: s.artist, artistId: s.artistId ?? '', coverArt: s.coverArt, songCount: 0, duration: 0},
      n: 1,
      first: counts.size,
    });
  }
  const rest = [...counts.values()].sort((a, b) => b.n - a.n || a.first - b.first);
  return [...starred, ...rest.map(r => r.album)];
}

/** Lower case without accents, to search and sort names. */
export function fold(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Sorted entries, pinned ones on top (in the same order). `recent` uses the
 * last time each entry was played (unknown = never, kept in server order);
 * `added` keeps the server order; `alpha` sorts by name.
 */
export function sortEntries(
  entries: readonly LibraryEntry[],
  mode: LibrarySortMode,
  playedAt: Readonly<Record<string, number>>,
  pinned: ReadonlySet<string>,
): LibraryEntry[] {
  const indexed = entries.map((e, i) => ({e, i}));
  if (mode === 'recent') {
    indexed.sort((a, b) => (playedAt[b.e.id] ?? 0) - (playedAt[a.e.id] ?? 0) || a.i - b.i);
  } else if (mode === 'alpha') {
    indexed.sort((a, b) => fold(a.e.name).localeCompare(fold(b.e.name)) || a.i - b.i);
  }
  const sorted = indexed.map(x => x.e);
  return [...sorted.filter(e => pinned.has(e.id)), ...sorted.filter(e => !pinned.has(e.id))];
}

/** Entries whose name (or album artist) contains the query, accents and case ignored. */
export function filterEntries(entries: readonly LibraryEntry[], query: string): readonly LibraryEntry[] {
  const q = fold(query.trim());
  if (!q) return entries;
  return entries.filter(e => fold(e.name).includes(q) || (e.artist ? fold(e.artist).includes(q) : false));
}
