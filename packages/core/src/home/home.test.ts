/**
 * @file home.test.ts
 * @description Tests for the home feed engine, the seeded random helpers and the memory cache.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { describe, expect, it } from 'vitest';
import { MemoryCache } from '../cache.ts';
import type { Album, Song } from '../subsonic/types.ts';
import { buildHome, favoriteArtists, mixCovers, planSeeds, topGenres, type HomeBase, type HomeExtra, type HomeSeeds } from './home.ts';
import { dailySeed, seededRng, shuffled } from './random.ts';

const NOW = new Date('2026-10-12T20:00:00');

const album = (id: string, extra: Partial<Album> = {}): Album => ({ id, name: `Album ${id}`, artist: 'A', artistId: 'ar1', ...extra });
const song = (id: string, extra: Partial<Song> = {}): Song => ({ id, title: `Song ${id}`, ...extra });

function base(overrides: Partial<HomeBase> = {}): HomeBase {
  return {
    recent: [album('r1'), album('r2'), album('shared')],
    frequent: [
      album('f1', { artistId: 'ar1', artist: 'Nova', playCount: 50, genre: 'Pop', played: '2026-01-01T00:00:00Z' }),
      album('f2', { artistId: 'ar2', artist: 'Sora', playCount: 10, genre: 'Electro', played: '2026-10-10T00:00:00Z' }),
    ],
    newest: [album('n1'), album('shared')],
    random: [album('x1'), album('x2'), album('r1')],
    starred: {
      song: [
        song('s1', { albumId: 'la1', album: 'Liked album', artistId: 'ar2', artist: 'Sora', genre: 'Electro' }),
        song('s2', { albumId: 'la1', album: 'Liked album', artistId: 'ar2', artist: 'Sora' }),
      ],
      album: [],
      artist: [],
    },
    playlists: [
      { id: 'p1', name: 'Old', songCount: 3, duration: 600, changed: '2026-01-01T00:00:00Z' },
      { id: 'p2', name: 'New', songCount: 3, duration: 600, changed: '2026-10-01T00:00:00Z' },
    ],
    ...overrides,
  };
}

const noExtra: HomeExtra = { similarArtistAlbums: [], similarSongs: [], genreMixes: [] };
const noSeeds: HomeSeeds = { genres: [] };

describe('random', () => {
  it('is reproducible for the same seed and differs between days', () => {
    const a = seededRng(42);
    const b = seededRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(dailySeed('doodz', new Date('2026-10-12T08:00:00'))).toBe(dailySeed('doodz', new Date('2026-10-12T23:00:00')));
    expect(dailySeed('doodz', new Date('2026-10-12T08:00:00'))).not.toBe(dailySeed('doodz', new Date('2026-10-13T08:00:00')));
    expect(dailySeed('doodz', NOW)).not.toBe(dailySeed('maman', NOW));
  });

  it('shuffles without losing items', () => {
    expect(shuffled([1, 2, 3, 4, 5], seededRng(1)).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('favoriteArtists', () => {
  it('ranks by plays, liked songs and liked artists', () => {
    const ranked = favoriteArtists(base());
    expect(ranked[0].artist.name).toBe('Nova');
    expect(ranked.map((r) => r.artist.id)).toEqual(['ar1', 'ar2']);
    const boosted = favoriteArtists(base({ starred: { song: [], album: [], artist: Array.from({ length: 11 }, () => ({ id: 'ar2', name: 'Sora' })) } }));
    expect(boosted[0].artist.id).toBe('ar2');
  });

  it('counts each artist of a song with several artists', () => {
    const duo = song('d', { artist: 'Lil Nas X • Billy Ray Cyrus', artistId: 'lnx', artists: [{ id: 'lnx', name: 'Lil Nas X' }, { id: 'brc', name: 'Billy Ray Cyrus' }] });
    const joined = song('j', { artist: 'Daft Punk • Pharrell Williams', artistId: 'dp' });
    const ranked = favoriteArtists(base({ frequent: [], starred: { song: [duo, joined], album: [], artist: [] } }));
    expect(ranked.map((r) => r.artist.name)).toEqual(['Lil Nas X', 'Billy Ray Cyrus', 'Daft Punk']);
  });

  it('uses the rank when the server gives no play count', () => {
    const ranked = favoriteArtists(base({ frequent: [album('a', { artistId: 'x', artist: 'X' }), album('b', { artistId: 'y', artist: 'Y' })], starred: { song: [], album: [], artist: [] } }));
    expect(ranked.map((r) => r.artist.id)).toEqual(['x', 'y']);
  });
});

describe('mixCovers', () => {
  it('keeps one cover per album, four at most', () => {
    const songs = [
      song('a', { albumId: 'A', coverArt: 'ca1' }),
      song('b', { albumId: 'A', coverArt: 'ca2' }),
      song('c', { albumId: 'B', coverArt: 'cb' }),
      song('d', { albumId: 'C', coverArt: 'cc' }),
      song('e', { albumId: 'D', coverArt: 'cd' }),
      song('f', { albumId: 'E', coverArt: 'ce' }),
    ];
    expect(mixCovers(songs)).toEqual(['ca1', 'cb', 'cc', 'cd']);
  });
});

describe('topGenres', () => {
  it('counts genres from albums and liked songs', () => {
    expect(topGenres(base())[0]).toBe('Electro');
  });
});

describe('buildHome', () => {
  const feed = buildHome(base(), noSeeds, noExtra, seededRng(7), NOW);

  it('puts recent and favorite artists first and random last', () => {
    expect(feed.shelves[0].id).toBe('recent');
    expect(feed.shelves[1].id).toBe('favoriteArtists');
    expect(feed.shelves[feed.shelves.length - 1].id).toBe('random');
  });

  it('never shows the same album twice across shelves', () => {
    const ids = feed.shelves.flatMap((s) => s.items).filter((i) => i.type === 'album').map((i) => (i.type === 'album' ? i.album.id : ''));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id === 'shared')).toHaveLength(1);
  });

  it('hides shelves without content', () => {
    expect(feed.shelves.find((s) => s.id === 'becauseLiked')).toBeUndefined();
    expect(feed.shelves.find((s) => s.id === 'magicMixes')).toBeUndefined();
  });

  it('builds "albums with songs you like" from liked songs', () => {
    const liked = feed.shelves.find((s) => s.id === 'likedAlbums');
    expect(liked?.items[0]).toMatchObject({ type: 'album', album: { id: 'la1', name: 'Liked album' } });
  });

  it('suggests rediscovering albums not played for two months', () => {
    const shelf = feed.shelves.find((s) => s.id === 'rediscover');
    expect(shelf?.items.map((i) => (i.type === 'album' ? i.album.id : ''))).toEqual(['f1']);
  });

  it('fills quick access with liked songs, latest playlists then recent albums', () => {
    expect(feed.quickAccess[0]).toEqual({ type: 'liked', count: 2 });
    expect(feed.quickAccess[1]).toMatchObject({ type: 'playlist', playlist: { id: 'p2' } });
    expect(feed.quickAccess.length).toBeLessThanOrEqual(8);
  });

  it('adds the rotating shelves from the second wave of data', () => {
    const seeds = planSeeds(base(), seededRng(3));
    const extra: HomeExtra = {
      similarArtistAlbums: [album('sim1', { artistId: 'ar9' })],
      similarSongs: [song('t1'), song('t2')],
      genreMixes: [{ genre: 'Electro', songs: Array.from({ length: 6 }, (_, i) => song(`g${i}`, { coverArt: `c${i}` })) }],
    };
    const full = buildHome(base(), { ...seeds, likedSong: song('s1') }, extra, seededRng(3), NOW);
    expect(full.shelves.map((s) => s.id)).toEqual(expect.arrayContaining(['moreLike', 'becauseLiked', 'magicMixes']));
    const mix = full.shelves.find((s) => s.id === 'magicMixes')?.items[0];
    expect(mix).toMatchObject({ type: 'mix', genre: 'Electro' });
  });

  it('is identical for the same day and seed', () => {
    const a = buildHome(base(), noSeeds, noExtra, seededRng(dailySeed('doodz', NOW)), NOW);
    const b = buildHome(base(), noSeeds, noExtra, seededRng(dailySeed('doodz', NOW)), NOW);
    expect(a).toEqual(b);
  });
});

describe('MemoryCache', () => {
  it('shares one request and expires', async () => {
    let now = 0;
    let calls = 0;
    const cache = new MemoryCache(() => now);
    const load = async () => ++calls;
    expect(await Promise.all([cache.get('k', 100, load), cache.get('k', 100, load)])).toEqual([1, 1]);
    now = 150;
    expect(await cache.get('k', 100, load)).toBe(2);
  });

  it('gives already received results synchronously', async () => {
    const cache = new MemoryCache(() => 0);
    expect(cache.peek('k')).toBeUndefined();
    await cache.get('k', 100, async () => 'v');
    expect(cache.peek('k')).toBe('v');
  });

  it('forgets failures and supports invalidation', async () => {
    const cache = new MemoryCache(() => 0);
    await expect(cache.get('a', 100, async () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    expect(await cache.get('a', 100, async () => 'ok')).toBe('ok');
    cache.invalidate('a');
    expect(await cache.get('a', 100, async () => 'fresh')).toBe('fresh');
  });
});
