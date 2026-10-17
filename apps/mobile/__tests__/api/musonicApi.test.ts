/**
 * @file musonicApi.test.ts
 * @description Deezer tracks are streamed through the Musonic API only when it
 *   is set up and answers (ADR-016, step A); every other track, and every track
 *   when the API is off or down, keeps the usual Subsonic stream URL.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
jest.mock('../../src/store/storage', () => ({storage: {getString: () => undefined, set: () => {}, delete: () => {}}, mmkvStorage: {getItem: () => null, setItem: () => {}, removeItem: () => {}}}));
jest.mock('../../src/store/localCovers', () => ({getLocalCoverUri: () => undefined}));
jest.mock('../../src/store/networkStore', () => ({useNetworkStore: {getState: () => ({setOffline: () => {}, setServerReachable: () => {}})}}));
jest.mock('../../src/services/network', () => ({isOnMobileData: () => false}));

import {configureClient, getStreamUrl} from '../../src/api/client';
import {checkMusonicApi, deezerSongId, isMusonicApiActive} from '../../src/api/musonicApi';
import {useSettingsStore} from '../../src/store/settingsStore';
import {migrateSettings} from '../../src/store/settingsMigrations';

const fetchMock = jest.fn();
(globalThis as {fetch: unknown}).fetch = fetchMock;
const answer = (status: number) => fetchMock.mockResolvedValue({status, ok: status >= 200 && status < 300});

beforeAll(() => {
  configureClient({id: '1', name: 's', url: 'https://music.example.com', username: 'u', password: 'p'});
});

beforeEach(() => {
  fetchMock.mockReset();
  useSettingsStore.setState({musonicApiUrl: '', musonicApiKey: ''});
});

it('recognizes OctoFiesta Deezer song ids only', () => {
  expect(deezerSongId('ext-deezer-song-3135556')).toBe('3135556');
  expect(deezerSongId('ext-deezer-album-302127')).toBeNull();
  expect(deezerSongId('a1b2c3')).toBeNull();
});

it('keeps the Subsonic URL when the API is not set up', async () => {
  expect(await checkMusonicApi()).toBe('notConfigured');
  expect(isMusonicApiActive()).toBe(false);
  expect(getStreamUrl('ext-deezer-song-42')).toMatch(/^https:\/\/music\.example\.com\/rest\/stream/);
});

it('streams Deezer tracks through the API once it answers', async () => {
  useSettingsStore.setState({musonicApiUrl: 'https://api.example.com/', musonicApiKey: 'k&y'});
  answer(200);
  expect(await checkMusonicApi()).toBe('ok');
  expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/v1/status', expect.objectContaining({headers: {'X-Api-Key': 'k&y'}}));
  expect(getStreamUrl('ext-deezer-song-42')).toBe('https://api.example.com/v1/stream/deezer:42?key=k%26y');
  // Library tracks never go through the API.
  expect(getStreamUrl('a1b2c3')).toMatch(/^https:\/\/music\.example\.com\/rest\/stream/);
});

it('falls back to the Subsonic URL when the API rejects the key or is down', async () => {
  useSettingsStore.setState({musonicApiUrl: 'https://api.example.com', musonicApiKey: 'bad'});
  answer(401);
  expect(await checkMusonicApi()).toBe('unauthorized');
  expect(getStreamUrl('ext-deezer-song-42')).toMatch(/^https:\/\/music\.example\.com\//);
  fetchMock.mockRejectedValue(new Error('network'));
  expect(await checkMusonicApi()).toBe('unreachable');
  expect(isMusonicApiActive()).toBe(false);
});

it('checking candidate settings does not change what playback uses', async () => {
  answer(200);
  expect(await checkMusonicApi({url: 'https://api.example.com', key: 'k'})).toBe('ok');
  expect(isMusonicApiActive()).toBe(false);
});

it('v2 settings migrate to v3 unchanged (the new fields default in the store)', () => {
  const v2 = {servers: [], locale: 'fr'};
  expect(migrateSettings(v2, 2)).toEqual(v2);
});
