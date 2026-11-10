/**
 * @file onlineIds.test.ts
 * @description Unit tests of the Deezer album and song ids: Musonic Server
 *   format by default, OctoFiesta format for a classic server; online ids.
 * @author DoodzProg
 * @license CC-BY-NC-4.0
 */
import {deezerAlbumId, deezerSongId, isOnlineId, setMusonicServer} from '../src/services/onlineIds';

describe('deezerAlbumId', () => {
  afterEach(() => setMusonicServer(true));

  it('uses the Musonic Server format by default', () => {
    expect(deezerAlbumId(302127)).toBe('dz-album-302127');
  });

  it('keeps the OctoFiesta format for a classic server', () => {
    setMusonicServer(false);
    expect(deezerAlbumId('302127')).toBe('ext-deezer-album-302127');
  });
});

describe('deezerSongId', () => {
  afterEach(() => setMusonicServer(true));

  it('uses the Musonic Server format by default', () => {
    expect(deezerSongId(3135556)).toBe('dz-track-3135556');
  });

  it('keeps the OctoFiesta format for a classic server', () => {
    setMusonicServer(false);
    expect(deezerSongId(3135556)).toBe('ext-deezer-song-3135556');
  });
});

describe('isOnlineId', () => {
  it('knows both online formats and nothing else', () => {
    expect(isOnlineId('dz-track-1')).toBe(true);
    expect(isOnlineId('ext-deezer-song-1')).toBe(true);
    expect(isOnlineId('6d75-736f')).toBe(false);
  });
});
