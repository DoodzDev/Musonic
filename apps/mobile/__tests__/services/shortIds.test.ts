/**
 * @file shortIds.test.ts
 * @description Unit tests for the switch to Musonic Server's short ids
 *   (ADR-026): every saved value keeps pointing at the same songs, cover files
 *   follow their key, other values are left alone, and running twice changes
 *   nothing.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
const mockSaved = new Map<string, string | boolean>();
const mockFiles = new Set<string>();

jest.mock('react-native-blob-util', () => ({
  fs: {
    dirs: {DocumentDir: '/docs'},
    exists: async (p: string) => mockFiles.has(p),
    mv: async (from: string, to: string) => {
      mockFiles.delete(from);
      mockFiles.add(to);
    },
  },
}));
jest.mock('../../src/store/storage', () => ({
  storage: {
    getString: (k: string) => {
      const v = mockSaved.get(k);
      return typeof v === 'string' ? v : undefined;
    },
    getBoolean: (k: string) => mockSaved.get(k) === true,
    set: (k: string, v: string | boolean) => mockSaved.set(k, v),
    delete: (k: string) => mockSaved.delete(k),
    getAllKeys: () => [...mockSaved.keys()],
  },
}));

import {
  SHORT_IDS_DONE_KEY,
  SHORT_IDS_PENDING_KEY,
  convertAtLaunch,
  convertSavedState,
} from '../../src/services/shortIds/boot';
import {convertDownloads, convertSettings, shortenFields} from '../../src/services/shortIds/convert';
import {coverFilePath} from '../../src/store/localCovers';

// Same vectors as the server (apps/server/src/ids.rs).
const SONG = '5220a049-bd94-47ae-8d35-2ca090cfb168';
const SONG_SHORT = '73A4WPDHD9a';
const ALBUM = '0c3c5e47-6f22-5dfe-ab18-9987368e4dac';
const ALBUM_SHORT = '1387MiQJoB4';
const ND = '4xDzN7lF2pq1Hc0Ab9Zk3s';

const saved = (key: string) => JSON.parse(String(mockSaved.get(key)));
const store = (state: unknown) => JSON.stringify({state, version: 1});

beforeEach(() => {
  mockSaved.clear();
  mockFiles.clear();
});

describe('convert', () => {
  it('converts id fields at any depth and nothing else', () => {
    const song = {id: SONG, title: SONG, albumId: ALBUM, coverArt: ALBUM, artists: [{id: ND, name: 'Sigur Rós'}]};
    expect(shortenFields(song)).toEqual({
      id: SONG_SHORT,
      title: SONG,
      albumId: ALBUM_SHORT,
      coverArt: ALBUM_SHORT,
      artists: [{id: '4xDzN7lF2pq', name: 'Sigur Rós'}],
    });
    expect(shortenFields(shortenFields(song))).toEqual(shortenFields(song));
  });

  it('re-keys downloads and lists the cover files to rename', () => {
    const {downloads, covers} = convertDownloads({
      [SONG]: {trackId: SONG, coverArt: ALBUM, coverSaved: true, localPath: '/music/a.mp3'},
      'dz-track-1': {trackId: 'dz-track-1', localPath: '/music/b.mp3'},
    });
    expect(Object.keys(downloads)).toEqual([SONG_SHORT, 'dz-track-1']);
    expect(downloads[SONG_SHORT]).toMatchObject({trackId: SONG_SHORT, coverArt: ALBUM_SHORT, localPath: '/music/a.mp3'});
    expect(covers).toEqual([[ALBUM, ALBUM_SHORT]]);
  });

  it('leaves the accounts of the settings alone', () => {
    const s = convertSettings({
      servers: [{id: SONG, url: 'https://music.example'}],
      activeServerId: SONG,
      pinnedLibraryIds: [ALBUM, 'liked'],
      lastPlayedPlaylists: {[ALBUM]: 5},
    });
    expect(s.servers).toEqual([{id: SONG, url: 'https://music.example'}]);
    expect(s.activeServerId).toBe(SONG);
    expect(s.pinnedLibraryIds).toEqual([ALBUM_SHORT, 'liked']);
    expect(s.lastPlayedPlaylists).toEqual({[ALBUM_SHORT]: 5});
  });
});

describe('at launch', () => {
  function seed() {
    mockSaved.set('musonic-downloads', store({downloads: {[SONG]: {trackId: SONG, coverArt: ALBUM, coverSaved: true}}}));
    mockSaved.set('playback-snapshot', JSON.stringify({version: 1, accountId: SONG, state: {source: {type: 'album', id: ALBUM}, current: {id: SONG}}}));
    mockSaved.set('playback-position', JSON.stringify({trackId: SONG, seconds: 42}));
    mockSaved.set('musonic-playlist-covers', JSON.stringify([`pl-${ALBUM}`]));
    mockSaved.set(`coverart_pl_${ALBUM}`, 'file:///docs/mine.jpg');
    mockSaved.set('all-songs-etag-v1', '"v7"');
    mockFiles.add(coverFilePath(ALBUM));
    mockFiles.add(coverFilePath(`pl-${ALBUM}`));
  }

  it('converts every saved value once a server announced short ids', async () => {
    seed();
    convertAtLaunch();
    expect(saved('playback-position').trackId).toBe(SONG); // not announced yet: nothing changes
    mockSaved.set(SHORT_IDS_PENDING_KEY, true);
    convertAtLaunch();
    expect(Object.keys(saved('musonic-downloads').state.downloads)).toEqual([SONG_SHORT]);
    const snapshot = saved('playback-snapshot');
    expect(snapshot.accountId).toBe(SONG);
    expect(snapshot.state).toEqual({source: {type: 'album', id: ALBUM_SHORT}, current: {id: SONG_SHORT}});
    expect(saved('playback-position')).toEqual({trackId: SONG_SHORT, seconds: 42});
    expect(saved('musonic-playlist-covers')).toEqual([`pl-${ALBUM_SHORT}`]);
    expect(mockSaved.get(`coverart_pl_${ALBUM_SHORT}`)).toBe('file:///docs/mine.jpg');
    expect(mockSaved.has(`coverart_pl_${ALBUM}`)).toBe(false);
    expect(mockSaved.has('all-songs-etag-v1')).toBe(false);
    expect(mockSaved.get(SHORT_IDS_DONE_KEY)).toBe(true);
    expect(mockSaved.has(SHORT_IDS_PENDING_KEY)).toBe(false);
    await new Promise<void>(r => setTimeout(r, 0));
    expect([...mockFiles].sort()).toEqual([coverFilePath(ALBUM_SHORT), coverFilePath(`pl-${ALBUM_SHORT}`)].sort());
  });

  it('can run twice', () => {
    seed();
    convertSavedState();
    const once = new Map(mockSaved);
    convertSavedState();
    expect(mockSaved).toEqual(once);
  });
});
