/**
 * @file libraryModel.test.ts
 * @description Library model (R5.3): artists list, sort with pins, search filter.
 * @author DoodzProg
 * @license CC-BY-NC-4.0
 */
import {
  collectAlbums,
  collectArtists,
  creditedArtists,
  filterEntries,
  sortEntries,
  type LibraryEntry,
} from '../../src/screens/Library/libraryModel';
import type {SubsonicAlbum, SubsonicSong} from '../../src/api/types';

const album = (artistId: string, artist: string): SubsonicAlbum =>
  ({id: `al-${artistId}-${Math.random()}`, name: 'A', artist, artistId, songCount: 1, duration: 1});
const song = (artistId: string, artist: string): SubsonicSong =>
  ({id: `s-${Math.random()}`, title: 'S', artist, artistId, album: 'A', duration: 1});
const entry = (id: string, name: string): LibraryEntry => ({kind: 'playlist', id, name});

describe('collectArtists', () => {
  it('puts starred artists first, then the most present ones, once each', () => {
    const out = collectArtists(
      [{id: 'b', name: 'Bea'}],
      [album('a', 'Ana'), album('b', 'Bea')],
      [song('c', 'Cleo'), song('c', 'Cleo'), song('a', 'Ana'), song('c', 'Cleo')],
    );
    expect(out.map(a => a.id)).toEqual(['b', 'c', 'a']);
  });

  it('gives server artists their cover id, not online ones', () => {
    const out = collectArtists([], [], [song('x1', 'X'), song('ext-deezer-artist-9', 'Y')]);
    expect(out.find(a => a.id === 'x1')?.coverArt).toBe('ar-x1');
    expect(out.find(a => a.id === 'ext-deezer-artist-9')?.coverArt).toBeUndefined();
  });

  it('skips songs without an artist id', () => {
    expect(collectArtists([], [], [{...song('a', 'A'), artistId: undefined}])).toEqual([]);
  });
});

describe('collectAlbums', () => {
  it('puts starred albums first, then the most liked ones, once each', () => {
    const liked = (albumId: string) => ({...song('a', 'A'), albumId, album: `Album ${albumId}`});
    const starred = {id: 's', name: 'Starred', artist: 'A', artistId: 'a', songCount: 3, duration: 1};
    const out = collectAlbums([starred], [liked('x'), liked('y'), liked('y'), liked('s')]);
    expect(out.map(a => a.id)).toEqual(['s', 'y', 'x']);
    expect(out[1].name).toBe('Album y');
  });
});

describe('sortEntries', () => {
  const list = [entry('1', 'Zèbre'), entry('2', 'avion'), entry('3', 'Été')];

  it('keeps the server order for "added"', () => {
    expect(sortEntries(list, 'added', {}, new Set()).map(e => e.id)).toEqual(['1', '2', '3']);
  });

  it('sorts by name, accents and case ignored', () => {
    expect(sortEntries(list, 'alpha', {}, new Set()).map(e => e.id)).toEqual(['2', '3', '1']);
  });

  it('sorts by last play, never played ones last in server order', () => {
    expect(sortEntries(list, 'recent', {'3': 10, '2': 20}, new Set()).map(e => e.id)).toEqual(['2', '3', '1']);
  });

  it('puts pinned entries on top', () => {
    expect(sortEntries(list, 'alpha', {}, new Set(['1'])).map(e => e.id)).toEqual(['1', '2', '3']);
  });
});

describe('filterEntries', () => {
  it('matches the name or the album artist, accents ignored', () => {
    const list: LibraryEntry[] = [entry('1', 'Été'), {kind: 'album', id: '2', name: 'Night', artist: 'Hélène'}];
    expect(filterEntries(list, 'ete').map(e => e.id)).toEqual(['1']);
    expect(filterEntries(list, 'helene').map(e => e.id)).toEqual(['2']);
    expect(filterEntries(list, '  ')).toHaveLength(2);
  });
});

describe('creditedArtists / collectArtists with several artists', () => {
  const multi = {
    id: 's1', title: 'Old Town Road', album: '7', duration: 1,
    artist: 'Lil Nas X • Billy Ray Cyrus', artistId: 'lnx',
    artists: [{id: 'lnx', name: 'Lil Nas X'}, {id: 'brc', name: 'Billy Ray Cyrus'}],
  } as SubsonicSong;

  it('uses the server list of artists', () => {
    expect(creditedArtists(multi)).toEqual([{id: 'lnx', name: 'Lil Nas X'}, {id: 'brc', name: 'Billy Ray Cyrus'}]);
  });
  it('without a list, keeps the first name with the artist id', () => {
    expect(creditedArtists({artist: 'Daft Punk • Pharrell Williams', artistId: 'dp'})).toEqual([{id: 'dp', name: 'Daft Punk'}]);
  });
  it('keeps names joined with & whole', () => {
    expect(creditedArtists({artist: 'Bigflo & Oli', artistId: 'bo'})).toEqual([{id: 'bo', name: 'Bigflo & Oli'}]);
  });
  it('lists each artist of a song on its own', () => {
    expect(collectArtists([], [], [multi]).map(a => a.name)).toEqual(['Lil Nas X', 'Billy Ray Cyrus']);
  });
});
