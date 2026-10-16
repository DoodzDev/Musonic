/**
 * @file searchModel.test.ts
 * @description Tests of the live search model: scope filter, best result and
 *   the results without the best one.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {bestResult, filterScope, isOnline, withoutBest, type SearchResults} from '../../src/screens/Search/searchModel';
import type {SubsonicAlbum, SubsonicArtist, SubsonicSong} from '../../src/api/types';

const artist = (id: string, name: string) => ({id, name} as SubsonicArtist);
const album = (id: string, name: string) => ({id, name, artist: 'X', artistId: 'x', songCount: 1, duration: 1} as SubsonicAlbum);
const song = (id: string, title: string) => ({id, title, artist: 'X', album: 'A', duration: 1} as SubsonicSong);

const results: SearchResults = {
  artists: [artist('a1', 'Daft Punk'), artist('ext-deezer-artist-1', 'Daft Punk Tribute')],
  albums: [album('al1', 'Discovery'), album('ext-deezer-album-2', 'Homework')],
  songs: [song('s1', 'Da Funk'), song('ext-deezer-song-3', 'Daft Punk Is Playing at My House')],
};

describe('isOnline / filterScope', () => {
  it('tells online items by their ext- id', () => {
    expect(isOnline('ext-deezer-song-1')).toBe(true);
    expect(isOnline('s1')).toBe(false);
  });
  it('keeps everything, the library only or online only', () => {
    expect(filterScope(results, 'all')).toBe(results);
    expect(filterScope(results, 'library').songs.map(s => s.id)).toEqual(['s1']);
    expect(filterScope(results, 'online').albums.map(a => a.id)).toEqual(['ext-deezer-album-2']);
  });
});

describe('bestResult', () => {
  it('prefers an exact name, ignoring case and accents', () => {
    expect(bestResult(results, 'daft punk')).toEqual({type: 'artist', artist: results.artists[0]});
    expect(bestResult(results, 'DISCOVERY')).toEqual({type: 'album', album: results.albums[0]});
  });
  it('then a name that starts with the query', () => {
    expect(bestResult(results, 'da fu')).toEqual({type: 'song', song: results.songs[0]});
  });
  it('else the first result, or nothing', () => {
    expect(bestResult(results, 'zzz')).toEqual({type: 'artist', artist: results.artists[0]});
    expect(bestResult({artists: [], albums: [], songs: []}, 'x')).toBeNull();
  });
});

describe('withoutBest', () => {
  it('removes the best result from its list only', () => {
    const rest = withoutBest(results, {type: 'artist', artist: results.artists[0]});
    expect(rest.artists.map(a => a.id)).toEqual(['ext-deezer-artist-1']);
    expect(rest.songs).toBe(results.songs);
  });
});
