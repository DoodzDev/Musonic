/**
 * @file toRNTPTrack.test.ts
 * @description Unit tests for the stream URL priority in toRNTPTrack:
 *   local file, then Navidrome stream, then the URL embedded in ext- tracks.
 *   The artwork always goes through the player cover (no server URL).
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
const mockGetLocalPath = jest.fn();

jest.mock('react-native-track-player', () => ({}));
jest.mock('../../src/api/client', () => ({
  getStreamUrl: (id: string) => `https://navidrome.test/rest/stream.view?id=${id}`,
  getCoverArtUrl: jest.fn(),
  subsonicGet: jest.fn(),
}));
jest.mock('../../src/api/endpoints/playlists', () => ({}));
jest.mock('../../src/api/endpoints/library', () => ({}));
jest.mock('../../src/api/deezer', () => ({}));
jest.mock('../../src/store/playerStore', () => ({usePlayerStore: {getState: jest.fn()}}));
jest.mock('../../src/services/playerArtwork', () => ({
  playerArtwork: (t: {id: string}) => `content://com.musonic.artwork/track_${t.id}`,
}));
jest.mock('../../src/store/downloadStore', () => ({
  useDownloadStore: {getState: () => ({getLocalPath: mockGetLocalPath})},
}));

import {toRNTPTrack} from '../../src/services/playerActions';
import type {Track} from '../../src/store/playerStore';

const baseTrack = {title: 'Song', artist: 'Artist', album: 'Album', duration: 180} as Track;

describe('toRNTPTrack', () => {
  beforeEach(() => mockGetLocalPath.mockReset());

  it('prefers a downloaded local file', () => {
    mockGetLocalPath.mockReturnValue('/data/musonic/42.mp3');
    const t = toRNTPTrack({...baseTrack, id: '42'} as Track);
    expect(t.url).toBe('file:///data/musonic/42.mp3');
  });

  it('uses the Navidrome stream for library tracks', () => {
    mockGetLocalPath.mockReturnValue(undefined);
    const t = toRNTPTrack({...baseTrack, id: '42'} as Track);
    expect(t.url).toBe('https://navidrome.test/rest/stream.view?id=42');
  });

  it('uses the embedded URL for ext- tracks', () => {
    mockGetLocalPath.mockReturnValue(undefined);
    const t = toRNTPTrack({...baseTrack, id: 'ext-deezer-song-1', streamUrl: 'https://proxy.test/1'} as Track);
    expect(t.url).toBe('https://proxy.test/1');
  });

  it('keeps the id as a string and copies metadata', () => {
    mockGetLocalPath.mockReturnValue(undefined);
    const t = toRNTPTrack({...baseTrack, id: 7 as unknown as string} as Track);
    expect(t).toMatchObject({id: '7', title: 'Song', artist: 'Artist', album: 'Album', duration: 180});
  });

  it('never hands a server cover URL to the player', () => {
    mockGetLocalPath.mockReturnValue(undefined);
    const t = toRNTPTrack({...baseTrack, id: '7', artwork: 'https://navidrome.test/rest/getCoverArt.view?id=7'} as Track);
    expect(t.artwork).toBe('content://com.musonic.artwork/track_7');
  });
});
