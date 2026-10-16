/**
 * @file allSongsModel.ts
 * @description Pure data side of "My music" (R5.7): sorting the whole
 *   library (A–Z, by artist, recently added), the section letter of a name
 *   and the list rows with a letter header before each section. No React,
 *   for the tests.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import type {SubsonicSong} from '../../api/types';

export type AllSongsSort = 'az' | 'artist' | 'recent';

/** Letters of the alphabetical index, `#` for everything else. */
export const INDEX_LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];

export type Row =
  | {kind: 'header'; key: string; letter: string}
  | {kind: 'song'; key: string; song: SubsonicSong; index: number};

/** Section letter of a name: its first letter without accents, or `#`. */
export function letterOf(name: string | undefined): string {
  const first = (name ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').charAt(0).toUpperCase();
  return first >= 'A' && first <= 'Z' ? first : '#';
}

/**
 * Sort key of a name: lower case, without accents, `#` names after Z.
 * Computed once per song and compared with plain `<`: `localeCompare` with a
 * locale is a native call on Hermes Android and froze the screen for tens of
 * seconds on a 1,700-song library.
 */
function sortKey(name: string | undefined): string {
  const plain = (name ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return (letterOf(plain) === '#' ? '~' : '') + plain;
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Songs in the chosen order (a new array). `recent` uses the server's `created` date. */
export function sortSongs(songs: readonly SubsonicSong[], sort: AllSongsSort): SubsonicSong[] {
  if (sort === 'recent') {
    const created = (s: SubsonicSong) => String((s as {created?: string}).created ?? '');
    return songs.map(s => ({s, k: created(s)})).sort((a, b) => compare(b.k, a.k)).map(e => e.s);
  }
  const keyed = songs.map(s => ({
    s,
    k1: sortKey(sort === 'artist' ? s.artist : s.title),
    k2: sort === 'artist' ? sortKey(s.title) : '',
  }));
  keyed.sort((a, b) => compare(a.k1, b.k1) || compare(a.k2, b.k2));
  return keyed.map(e => e.s);
}

/**
 * List rows: songs, with a letter header before each section in the A–Z and
 * artist orders (not in "recent", nor while searching). `index` is the song's
 * position in `songs`, for playback.
 */
export function buildRows(songs: readonly SubsonicSong[], sort: AllSongsSort, withHeaders: boolean): Row[] {
  const rows: Row[] = [];
  let current = '';
  songs.forEach((song, index) => {
    if (withHeaders && sort !== 'recent') {
      const letter = letterOf(sort === 'artist' ? song.artist : song.title);
      if (letter !== current) {
        current = letter;
        rows.push({kind: 'header', key: `h-${letter}`, letter});
      }
    }
    rows.push({kind: 'song', key: `${song.id}-${index}`, song, index});
  });
  return rows;
}

/** Row index of each letter header, and of the nearest one for a missing letter. */
export function headerIndex(rows: readonly Row[], letter: string): number | undefined {
  const at = new Map<string, number>();
  rows.forEach((r, i) => { if (r.kind === 'header') at.set(r.letter, i); });
  const start = INDEX_LETTERS.indexOf(letter);
  for (let i = start; i < INDEX_LETTERS.length; i++) {
    const hit = at.get(INDEX_LETTERS[i]);
    if (hit !== undefined) return hit;
  }
  for (let i = start - 1; i >= 0; i--) {
    const hit = at.get(INDEX_LETTERS[i]);
    if (hit !== undefined) return hit;
  }
  return undefined;
}
