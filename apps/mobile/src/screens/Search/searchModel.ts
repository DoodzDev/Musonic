/**
 * @file searchModel.ts
 * @description Pure data side of the live search (R5.2): the scope filter
 *   (all, my library, online), the best result and the rows of the results
 *   list. No React, for the tests.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import type {SubsonicAlbum, SubsonicArtist, SubsonicSong} from '../../api/types';

/** `podcasts`: the podcast directories instead of the music (ADR-023). */
export type SearchScope = 'all' | 'library' | 'online' | 'podcasts';

export type SearchResults = {
  artists: SubsonicArtist[];
  albums: SubsonicAlbum[];
  songs: SubsonicSong[];
};

export type BestResult =
  | {type: 'artist'; artist: SubsonicArtist}
  | {type: 'album'; album: SubsonicAlbum}
  | {type: 'song'; song: SubsonicSong};

/** Online catalogue items (served by the proxy) have `ext-` ids. */
export function isOnline(id: string | number): boolean {
  return String(id).startsWith('ext-');
}

/** Only the results of the chosen scope. */
export function filterScope(results: SearchResults, scope: SearchScope): SearchResults {
  if (scope === 'all' || scope === 'podcasts') return results;
  const keep = (id: string | number) => (scope === 'online' ? isOnline(id) : !isOnline(id));
  return {
    artists: results.artists.filter(a => keep(a.id)),
    albums: results.albums.filter(a => keep(a.id)),
    songs: results.songs.filter(s => keep(s.id)),
  };
}

function plain(text: string | undefined): string {
  return (text ?? '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * The best result: an exact name match (artist, then album, then song), else
 * a name that starts with the query, else the first artist, album or song.
 */
export function bestResult(results: SearchResults, query: string): BestResult | null {
  const q = plain(query);
  const candidates: BestResult[] = [
    ...results.artists.map(artist => ({type: 'artist' as const, artist})),
    ...results.albums.map(album => ({type: 'album' as const, album})),
    ...results.songs.map(song => ({type: 'song' as const, song})),
  ];
  if (candidates.length === 0) return null;
  const nameOf = (c: BestResult) => plain(c.type === 'artist' ? c.artist.name : c.type === 'album' ? c.album.name : c.song.title);
  return (
    candidates.find(c => nameOf(c) === q) ??
    candidates.find(c => q.length > 0 && nameOf(c).startsWith(q)) ??
    candidates[0]
  );
}

/** The results without the best one (it is shown on its own above them). */
export function withoutBest(results: SearchResults, best: BestResult | null): SearchResults {
  if (!best) return results;
  return {
    artists: best.type === 'artist' ? results.artists.filter(a => a.id !== best.artist.id) : results.artists,
    albums: best.type === 'album' ? results.albums.filter(a => a.id !== best.album.id) : results.albums,
    songs: best.type === 'song' ? results.songs.filter(s => s.id !== best.song.id) : results.songs,
  };
}
