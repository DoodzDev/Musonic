/**
 * @file offlineSongs.test.ts
 * @description Unit tests for the library lists shown offline.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {downloadedSongs, offlineLikedSongs, playlistCoversToKeep} from '../../src/utils/offlineSongs';
import type {DownloadedTrack} from '../../src/store/downloadStore';
import type {SubsonicPlaylist, SubsonicSong} from '../../src/api/types';

const dl = (trackId: string, title: string): DownloadedTrack => ({
  trackId, title, artist: 'A', album: 'B', localPath: `/x/${trackId}.mp3`, duration: 1, fileSize: 1, downloadedAt: 0,
});
const song = (id: string, title: string): SubsonicSong => ({id, title, artist: 'A', album: 'B', duration: 1, artistId: 'ar1'});

const downloads = {t1: dl('t1', 'beta'), t2: dl('t2', 'Alpha'), t3: dl('t3', 'gamma')};

describe('downloadedSongs', () => {
  it('lists every downloaded track by title, case-insensitive', () => {
    expect(downloadedSongs(downloads).map(s => s.id)).toEqual(['t2', 't1', 't3']);
  });

  it('is empty without downloads', () => {
    expect(downloadedSongs({})).toEqual([]);
  });
});

describe('offlineLikedSongs', () => {
  it('keeps only downloaded likes, in the saved order, with the saved metadata', () => {
    const saved = [song('t3', 'gamma'), song('x9', 'not downloaded'), song('t1', 'beta')];
    const r = offlineLikedSongs(saved, new Set(), downloads);
    expect(r.map(s => s.id)).toEqual(['t3', 't1']);
    expect(r[0].artistId).toBe('ar1');
  });

  it('adds downloaded tracks liked this session but missing from the saved copy', () => {
    const r = offlineLikedSongs([song('t3', 'gamma')], new Set(['t1', 't2']), downloads);
    expect(r.map(s => s.id)).toEqual(['t3', 't2', 't1']);
  });

  it('never lists a downloaded track that is not liked', () => {
    expect(offlineLikedSongs([], new Set(), downloads)).toEqual([]);
  });
});

describe('playlistCoversToKeep', () => {
  const pl = (id: string, coverArt?: string): SubsonicPlaylist => ({id, name: id, songCount: 1, duration: 1, coverArt});

  it('keeps the covers of playlists holding a downloaded track, once each', () => {
    const playlists = [pl('p1', 'pl-p1_a'), pl('p2', 'pl-p2_b'), pl('p3'), pl('p4', 'pl-p1_a')];
    const songs = {p1: [song('t1', 'beta')], p2: [song('x9', 'nope')], p3: [song('t2', 'Alpha')], p4: [song('t3', 'gamma')]};
    expect(playlistCoversToKeep(playlists, songs, downloads)).toEqual(['pl-p1_a']);
  });

  it('keeps nothing for playlists never fetched', () => {
    expect(playlistCoversToKeep([pl('p1', 'pl-p1_a')], {}, downloads)).toEqual([]);
  });
});
