/**
 * @file streamQuality.test.ts
 * @description Stream URLs follow the quality chosen for the current network
 *   (Wi-Fi or mobile data); downloads always ask for the original file.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
jest.mock('../../src/store/storage', () => ({storage: {getString: () => undefined, set: () => {}, delete: () => {}}, mmkvStorage: {getItem: () => null, setItem: () => {}, removeItem: () => {}}}));
jest.mock('../../src/store/localCovers', () => ({getLocalCoverUri: () => undefined}));
jest.mock('../../src/store/networkStore', () => ({useNetworkStore: {getState: () => ({setOffline: () => {}, setServerReachable: () => {}})}}));
let mockMobileData = false;
jest.mock('../../src/services/network', () => ({isOnMobileData: () => mockMobileData}));

import {configureClient, getStreamUrl} from '../../src/api/client';
import {useSettingsStore} from '../../src/store/settingsStore';

const bitrate = (url: string) => new URL(url).searchParams.get('maxBitRate');

beforeAll(() => {
  configureClient({id: '1', name: 's', url: 'https://music.example.com', username: 'u', password: 'p'});
  useSettingsStore.setState({streamQualityWifi: 0, streamQualityMobile: 192});
});

it('streams the original file on Wi-Fi by default', () => {
  mockMobileData = false;
  expect(bitrate(getStreamUrl('1'))).toBeNull();
});

it('caps the bitrate on mobile data', () => {
  mockMobileData = true;
  expect(bitrate(getStreamUrl('1'))).toBe('192');
});

it('always downloads the original file', () => {
  mockMobileData = true;
  expect(bitrate(getStreamUrl('1', {original: true}))).toBeNull();
});
