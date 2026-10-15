/**
 * @file homeSource.test.ts
 * @description The mobile API feeds the shared home engine: the adapter turns
 *   Subsonic answers into the engine's types, and the feed comes out complete.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
const mockGet = jest.fn();
jest.mock('../../src/api/client', () => ({subsonicGet: (...args: unknown[]) => mockGet(...args)}));

import {loadHome} from '@musonic/core/home';
import {homeSource} from '../../src/services/home/homeSource';

const album = (id: string, artistId = `ar-${id}`, extra = {}) => ({id, name: `Album ${id}`, artist: `Artist ${artistId}`, artistId, coverArt: `al-${id}`, ...extra});
const song = (id: string, genre = 'Rock') => ({id, title: `Song ${id}`, artist: 'A', artistId: 'ar-1', album: 'B', albumId: 'al1', coverArt: `c-${id}`, genre, duration: 1});

function server(endpoint: string, params: Record<string, unknown> = {}) {
  switch (endpoint) {
    case 'getAlbumList2.view':
      return {albumList2: {album: [1, 2, 3, 4, 5].map(i => album(`${params.type}-${i}`, 'ar-1', {genre: 'Rock'}))}};
    case 'getStarred2.view':
      return {starred2: {song: [song('s1'), song('s2')], album: [], artist: []}};
    case 'getPlaylists.view':
      return {playlists: {playlist: [{id: 'p1', name: 'Chill', songCount: 3, duration: 1, changed: '2026-10-01'}]}};
    case 'getArtistInfo2.view':
      return {artistInfo2: {similarArtist: [{id: 'ar-9', name: 'Similar'}]}};
    case 'getArtist.view':
      return {artist: {id: params.id, name: 'Similar', album: [album('sim-1', 'ar-9', {year: 2020})]}};
    case 'getSimilarSongs2.view':
      return {similarSongs2: {song: [song('x1'), song('x2'), song('x3'), song('x4')]}};
    case 'getRandomSongs.view':
      return {randomSongs: {song: Array.from({length: 8}, (_, i) => song(`r${i}-${params.genre}`, String(params.genre)))}};
    default:
      throw new Error(`unexpected ${endpoint}`);
  }
}

describe('homeSource', () => {
  beforeEach(() => mockGet.mockReset().mockImplementation(async (e: string, p?: Record<string, unknown>) => server(e, p)));

  it('maps Subsonic answers to the engine types, with safe defaults', async () => {
    mockGet.mockResolvedValueOnce({});
    expect(await homeSource.getAlbumList('recent', {size: 3})).toEqual([]);
    expect(mockGet).toHaveBeenLastCalledWith('getAlbumList2.view', {type: 'recent', size: 3});
    mockGet.mockResolvedValueOnce({});
    expect(await homeSource.getStarred()).toEqual({song: [], album: [], artist: []});
    mockGet.mockResolvedValueOnce({artist: {id: 'a', name: 'A'}});
    expect((await homeSource.getArtist('a')).album).toEqual([]);
  });

  it('gives the shared engine a complete feed', async () => {
    const feed = await loadHome(homeSource, {username: 'doodz', now: new Date('2026-10-15T19:00:00')});
    expect(feed.quickAccess[0]).toEqual({type: 'liked', count: 2});
    expect(feed.quickAccess.some(i => i.type === 'playlist')).toBe(true);
    const ids = feed.shelves.map(s => s.id);
    expect(ids[0]).toBe('recent');
    expect(ids).toContain('magicMixes');
    const mixes = feed.shelves.find(s => s.id === 'magicMixes')!;
    expect(mixes.items[0]).toMatchObject({type: 'mix', genre: 'Rock'});
  });

  it('still builds a feed when a source fails (only its shelf goes)', async () => {
    mockGet.mockImplementation(async (e: string, p?: Record<string, unknown>) => {
      if (e === 'getStarred2.view') throw new Error('down');
      return server(e, p);
    });
    const feed = await loadHome(homeSource, {username: 'doodz'});
    expect(feed.shelves.length).toBeGreaterThan(0);
    expect(feed.quickAccess.some(i => i.type === 'liked')).toBe(false);
  });
});
