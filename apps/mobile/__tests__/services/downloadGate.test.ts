/**
 * @file downloadGate.test.ts
 * @description "Download on Wi-Fi only": free on Wi-Fi, a confirmation on
 *   mobile data, automatic downloads skipped on mobile data; storage limit.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
// The toast pulls in Reanimated, which needs its native part.
jest.mock('../../src/components/ui/Toast', () => ({toast: {error: jest.fn()}}));
jest.mock('../../src/store/storage', () => ({storage: {getString: () => undefined, set: () => {}, delete: () => {}}, mmkvStorage: {getItem: () => null, setItem: () => {}, removeItem: () => {}}}));
let mockMobileData = false;
jest.mock('../../src/services/network', () => ({isOnMobileData: () => mockMobileData}));

import {Alert} from 'react-native';
import {canDownloadAutomatically, confirmDownload, isStorageFull} from '../../src/services/downloadGate';
import {useSettingsStore} from '../../src/store/settingsStore';

/** Presses the alert button at `index` (0 = cancel, 1 = download). */
function answerAlert(index: number) {
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.[index]?.onPress?.();
  });
}

beforeEach(() => {
  jest.restoreAllMocks();
  useSettingsStore.setState({downloadWifiOnly: true});
});

it('downloads freely on Wi-Fi', async () => {
  mockMobileData = false;
  const alert = jest.spyOn(Alert, 'alert');
  await expect(confirmDownload(3)).resolves.toBe(true);
  expect(alert).not.toHaveBeenCalled();
  expect(canDownloadAutomatically()).toBe(true);
});

it('asks on mobile data and follows the answer', async () => {
  mockMobileData = true;
  answerAlert(1);
  await expect(confirmDownload(3)).resolves.toBe(true);
  answerAlert(0);
  await expect(confirmDownload(3)).resolves.toBe(false);
});

it('skips automatic downloads on mobile data', () => {
  mockMobileData = true;
  expect(canDownloadAutomatically()).toBe(false);
});

it('never asks when Wi-Fi only is off', async () => {
  mockMobileData = true;
  useSettingsStore.setState({downloadWifiOnly: false});
  const alert = jest.spyOn(Alert, 'alert');
  await expect(confirmDownload(1)).resolves.toBe(true);
  expect(alert).not.toHaveBeenCalled();
  expect(canDownloadAutomatically()).toBe(true);
});

describe('storage limit', () => {
  const GB = 1024 * 1024 * 1024;

  it('is never full without a limit', () => {
    useSettingsStore.setState({storageLimitMB: 0});
    expect(isStorageFull(100 * GB)).toBe(false);
  });

  it('is full once the space allowed is used', () => {
    useSettingsStore.setState({storageLimitMB: 2048});
    expect(isStorageFull(1.9 * GB)).toBe(false);
    expect(isStorageFull(2 * GB)).toBe(true);
  });
});
