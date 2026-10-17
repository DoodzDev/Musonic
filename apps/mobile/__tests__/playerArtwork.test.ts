/**
 * @file playerArtwork.test.ts
 * @description Unit tests of the player cover: the native player never gets a
 *   server URL (it carries the credentials), only a Musonic content URI whose
 *   source is registered once.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
const mockRegisterArtwork = jest.fn();

jest.mock('react-native', () => ({
  Platform: {OS: 'android'},
  NativeModules: {
    MusonicAuto: {registerArtwork: (key: string, uri: string) => mockRegisterArtwork(key, uri), getConstants: () => ({artworkAuthority: 'com.musonic.artwork'})},
  },
}));
jest.mock('../src/api/client', () => ({
  getCoverArtUrl: (id: string, size: number) => `https://music.example/rest/getCoverArt.view?id=${id}&size=${size}&p=secret`,
}));

import {isPlayerArtworkUri, playerArtwork} from '../src/services/playerArtwork';

beforeEach(() => mockRegisterArtwork.mockClear());

it('hands a content URI to the player and keeps the server URL native-side', () => {
  const uri = playerArtwork({id: '7', coverArt: 'al-1'});
  expect(uri).toBe('content://com.musonic.artwork/track_al-1');
  expect(uri).not.toContain('secret');
  expect(mockRegisterArtwork).toHaveBeenCalledWith('track_al-1', expect.stringContaining('id=al-1'));
  expect(isPlayerArtworkUri(uri)).toBe(true);
});

it('registers a source only once', () => {
  playerArtwork({id: '8', coverArt: 'al-2'});
  playerArtwork({id: '9', coverArt: 'al-2'});
  expect(mockRegisterArtwork).toHaveBeenCalledTimes(1);
});

it('uses the track artwork when it has one (local file, external cover)', () => {
  const uri = playerArtwork({id: 'ext-5', artwork: 'https://cdn.example/cover.jpg'});
  expect(uri).toBe('content://com.musonic.artwork/track_ext-5');
  expect(mockRegisterArtwork).toHaveBeenCalledWith('track_ext-5', 'https://cdn.example/cover.jpg');
});

it('keeps the registered source of a URI read back from the player', () => {
  const uri = playerArtwork({id: 'ext-6', artwork: 'https://cdn.example/six.jpg'});
  mockRegisterArtwork.mockClear();
  expect(playerArtwork({id: 'ext-6', artwork: uri})).toBe(uri);
  expect(mockRegisterArtwork).not.toHaveBeenCalled();
});
