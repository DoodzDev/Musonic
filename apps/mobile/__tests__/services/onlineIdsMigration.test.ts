/**
 * @file onlineIdsMigration.test.ts
 * @description Unit tests of the conversion of saved Deezer ids: OctoFiesta ids
 *   become Musonic Server ones (URLs included), only after the server asked,
 *   and only once.
 * @author DoodzProg
 * @license CC-BY-NC-4.0
 */
const mockValues = new Map<string, string | boolean>();

jest.mock('../../src/store/storage', () => ({
  storage: {
    getAllKeys: () => [...mockValues.keys()],
    getString: (k: string) => {
      const v = mockValues.get(k);
      return typeof v === 'string' ? v : undefined;
    },
    getBoolean: (k: string) => mockValues.get(k) === true,
    set: (k: string, v: string | boolean) => mockValues.set(k, v),
    delete: (k: string) => mockValues.delete(k),
  },
}));

import {toMusonicOnlineIds} from '../../src/services/onlineIds';
import {convertOnlineIdsAtLaunch, markOnlineIdsPending} from '../../src/services/onlineIdsMigration';

const saved = JSON.stringify({
  current: {id: 'ext-deezer-song-12', coverArt: 'ext-deezer-song-12', url: 'https://x/rest/stream?id=ext-deezer-song-12&u=a'},
  album: 'ext-deezer-album-7',
  library: '6d75-736f',
});

beforeEach(() => mockValues.clear());

describe('toMusonicOnlineIds', () => {
  it('rewrites songs, albums and artists, URLs included, and nothing else', () => {
    const out = JSON.parse(toMusonicOnlineIds(saved));
    expect(out.current).toEqual({id: 'dz-track-12', coverArt: 'dz-track-12', url: 'https://x/rest/stream?id=dz-track-12&u=a'});
    expect(out.album).toBe('dz-album-7');
    expect(out.library).toBe('6d75-736f');
    expect(toMusonicOnlineIds('ext-deezer-artist-3')).toBe('dz-artist-3');
  });
});

describe('convertOnlineIdsAtLaunch', () => {
  it('does nothing until the server asked for it', () => {
    mockValues.set('playback-snapshot', saved);
    convertOnlineIdsAtLaunch();
    expect(mockValues.get('playback-snapshot')).toBe(saved);
  });

  it('converts every saved value once', () => {
    mockValues.set('playback-snapshot', saved);
    mockValues.set('flag', true);
    markOnlineIdsPending();
    convertOnlineIdsAtLaunch();
    expect(String(mockValues.get('playback-snapshot'))).not.toContain('ext-deezer-');
    expect(mockValues.get('flag')).toBe(true);
    // Marked done: a value saved later with an old id is left alone.
    mockValues.set('later', 'ext-deezer-song-1');
    markOnlineIdsPending();
    convertOnlineIdsAtLaunch();
    expect(mockValues.get('later')).toBe('ext-deezer-song-1');
  });
});
