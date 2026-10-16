/**
 * @file allSongsModel.test.ts
 * @description Tests of the "My music" model: section letters, the three
 *   sorts, the letter headers and the jump to the nearest letter.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {buildRows, headerIndex, letterOf, sortSongs} from '../../src/screens/AllSongs/allSongsModel';
import type {SubsonicSong} from '../../src/api/types';

const song = (id: string, title: string, artist: string, created?: string) =>
  ({id, title, artist, created} as unknown as SubsonicSong);

const songs = [
  song('1', 'Été indien', 'Joe Dassin', '2024-01-01'),
  song('2', '99 Luftballons', 'Nena', '2025-06-01'),
  song('3', 'alors on danse', 'Stromae', '2023-01-01'),
  song('4', 'Bohemian Rhapsody', 'Queen', '2025-01-01'),
];

describe('letterOf', () => {
  it('drops accents and upper-cases', () => {
    expect(letterOf('été')).toBe('E');
    expect(letterOf('  zèbre')).toBe('Z');
  });
  it('puts digits, symbols and empty names under #', () => {
    expect(letterOf('99 Luftballons')).toBe('#');
    expect(letterOf('(intro)')).toBe('#');
    expect(letterOf(undefined)).toBe('#');
  });
});

describe('sortSongs', () => {
  it('sorts by title, ignoring case and accents, # last', () => {
    expect(sortSongs(songs, 'az').map(s => s.id)).toEqual(['3', '4', '1', '2']);
  });
  it('sorts by artist', () => {
    expect(sortSongs(songs, 'artist').map(s => s.id)).toEqual(['1', '2', '4', '3']);
  });
  it('sorts the most recently added first', () => {
    expect(sortSongs(songs, 'recent').map(s => s.id)).toEqual(['2', '4', '1', '3']);
  });
  it('does not change the given array', () => {
    const copy = [...songs];
    sortSongs(songs, 'az');
    expect(songs).toEqual(copy);
  });
});

describe('buildRows', () => {
  it('adds a header before each letter, with the song positions', () => {
    const rows = buildRows(sortSongs(songs, 'az'), 'az', true);
    expect(rows.map(r => (r.kind === 'header' ? r.letter : r.index))).toEqual(['A', 0, 'B', 1, 'E', 2, '#', 3]);
  });
  it('has no header in the recent order nor while searching', () => {
    expect(buildRows(songs, 'recent', true).every(r => r.kind === 'song')).toBe(true);
    expect(buildRows(songs, 'az', false).every(r => r.kind === 'song')).toBe(true);
  });
});

describe('headerIndex', () => {
  const rows = buildRows(sortSongs(songs, 'az'), 'az', true);
  it('finds the header of a letter', () => {
    expect(headerIndex(rows, 'B')).toBe(2);
  });
  it('falls back to the next letter, then the previous one', () => {
    expect(headerIndex(rows, 'C')).toBe(4);
    expect(headerIndex([], 'A')).toBeUndefined();
  });
});
