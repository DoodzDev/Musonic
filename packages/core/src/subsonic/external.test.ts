/**
 * @file external.test.ts
 * @description Tests for finding the library copy of an online track.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { describe, expect, it } from 'vitest';
import { findLibraryMatch, isExternalId } from './external.ts';
import type { Song } from './types.ts';

const online: Song = { id: 'ext-deezer-song-727733', title: 'Ventura Highway', artist: 'America', duration: 213 };

describe('findLibraryMatch', () => {
  it('skips other online results and picks the library copy', () => {
    const copy = { id: 'a1', title: 'Ventura Highway', artist: 'America', duration: 214 };
    expect(findLibraryMatch(online, [{ ...online }, copy])).toBe(copy);
  });

  it('ignores case, accents and punctuation', () => {
    const song = { id: 'ext-deezer-song-1', title: 'Hoppípolla', artist: 'Sigur Rós', duration: 270 };
    const copy = { id: 'b2', title: 'hoppipolla', artist: 'Sigur Ros', duration: 270 };
    expect(findLibraryMatch(song, [copy])).toBe(copy);
  });

  it('matches on the main artist when several are credited', () => {
    const song = { ...online, artist: 'America • Someone', artists: [{ id: 'x', name: 'America' }] };
    const copy = { id: 'c3', title: 'Ventura Highway', artist: 'America', duration: 213 };
    expect(findLibraryMatch(song, [copy])).toBe(copy);
  });

  it('rejects another version of a different length or artist', () => {
    expect(findLibraryMatch(online, [{ id: 'd4', title: 'Ventura Highway', artist: 'America', duration: 260 }])).toBeNull();
    expect(findLibraryMatch(online, [{ id: 'e5', title: 'Ventura Highway', artist: 'Cover Band', duration: 213 }])).toBeNull();
  });
});

describe('isExternalId', () => {
  it('spots proxy ids', () => {
    expect(isExternalId('ext-deezer-song-1')).toBe(true);
    expect(isExternalId('3f2a')).toBe(false);
  });
});
