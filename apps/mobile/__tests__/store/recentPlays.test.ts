/**
 * @file recentPlays.test.ts
 * @description What a play adds to "Recently played" (ADR-010 C1).
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
jest.mock('../../src/store/storage', () => ({
  mmkvStorage: {getItem: () => null, setItem: () => {}, removeItem: () => {}},
}));

import {describePlay, pushPlay, type RecentPlay} from '../../src/store/recentPlaysStore';

const tracks = [
  {id: 't1', title: 'One', artist: 'A', album: 'Alb', coverArt: 'c1'},
  {id: 't2', title: 'Two', artist: 'B', album: 'Alb', coverArt: 'c2'},
];

describe('describePlay', () => {
  it('records the album or the playlist that was launched, even from one of its tracks', () => {
    expect(describePlay({type: 'album', id: 'al1', name: 'Alb'}, tracks, 't2', 1)).toMatchObject({kind: 'album', id: 'al1', name: 'Alb', artist: 'B'});
    expect(describePlay({type: 'playlist', id: 'p1', name: 'Chill'}, tracks, undefined, 1)).toMatchObject({kind: 'playlist', id: 'p1', name: 'Chill'});
  });

  it('records a track launched on its own as that track', () => {
    expect(describePlay({type: 'search'}, tracks, 't2', 1)).toMatchObject({kind: 'song', id: 't2', name: 'Two', artist: 'B'});
    expect(describePlay({type: 'recommendations'}, tracks, undefined, 1)).toMatchObject({kind: 'song', id: 't1'});
  });

  it('records liked songs, my music, Magic Mixes and artists', () => {
    expect(describePlay({type: 'liked'}, tracks, undefined, 1)?.kind).toBe('liked');
    expect(describePlay({type: 'library'}, tracks, undefined, 1)?.kind).toBe('library');
    expect(describePlay({type: 'mix', id: 'Rock', name: 'Rock'}, tracks, undefined, 1)).toMatchObject({kind: 'mix', id: 'Rock'});
    expect(describePlay({type: 'artist', id: 'ar1', name: 'A'}, tracks, undefined, 1)).toMatchObject({kind: 'artist', id: 'ar1'});
  });

  it('records nothing for an empty list', () => {
    expect(describePlay({type: 'album', id: 'al1'}, [], undefined, 1)).toBeNull();
  });
});

describe('pushPlay', () => {
  const play = (kind: RecentPlay['kind'], id: string, at: number): RecentPlay => ({kind, id, name: id, playedAt: at});

  it('puts the latest play first, once', () => {
    const list = pushPlay(pushPlay(pushPlay([], play('album', 'a', 1)), play('song', 's', 2)), play('album', 'a', 3));
    expect(list.map(p => `${p.kind}:${p.id}`)).toEqual(['album:a', 'song:s']);
    expect(list[0].playedAt).toBe(3);
  });

  it('keeps an album and a song with the same id apart', () => {
    expect(pushPlay([play('song', 'x', 1)], play('album', 'x', 2))).toHaveLength(2);
  });

  it('keeps the 20 latest', () => {
    let list: RecentPlay[] = [];
    for (let i = 0; i < 25; i++) list = pushPlay(list, play('song', `s${i}`, i));
    expect(list).toHaveLength(20);
    expect(list[0].id).toBe('s24');
  });
});
