/**
 * @file updateChecker.test.ts
 * @description Unit tests for the update checker: only `mobile-v…` releases may
 *   trigger the mobile update prompt, web and desktop releases are ignored.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
const mockAlert = jest.fn();

jest.mock('react-native', () => ({
  Alert: {alert: (...args: unknown[]) => mockAlert(...args)},
  Linking: {openURL: jest.fn()},
}));
jest.mock('../../package.json', () => ({version: '1.0.6'}));
jest.mock('../../src/i18n', () => ({
  getT: () => ({
    playlistOptions: {cancelButton: 'Cancel'},
    settings: {
      updates: {
        newVersionTitle: 'new',
        newVersionMessage: (v: string) => `new ${v}`,
        upToDateTitle: 'up-to-date',
        upToDateMessage: (local: string, remote: string) => `${local} ${remote}`,
        viewRelease: 'View',
        error: 'error',
      },
    },
  }),
}));

import {checkForUpdate, checkForUpdateSilent} from '../../src/services/updateChecker';

const release = (tag_name: string) => ({tag_name, html_url: `https://github.test/${tag_name}`});

function mockReleases(list: unknown[]) {
  globalThis.fetch = jest.fn().mockResolvedValue({ok: true, json: async () => list}) as jest.Mock;
}

describe('updateChecker', () => {
  beforeEach(() => mockAlert.mockReset());

  it('prompts for a newer mobile release', async () => {
    mockReleases([release('web-v0.1.0'), release('mobile-v1.0.7'), release('mobile-v1.0.6')]);
    await checkForUpdateSilent();
    expect(mockAlert).toHaveBeenCalledTimes(1);
    expect(mockAlert.mock.calls[0][1]).toBe('new 1.0.7');
  });

  it('never prompts for a web or desktop release', async () => {
    mockReleases([release('web-v9.0.0'), release('desktop-v9.0.0'), release('mobile-v1.0.6')]);
    await checkForUpdateSilent();
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it('reports the latest mobile version when up to date', async () => {
    mockReleases([release('web-v9.0.0'), release('mobile-v1.0.6')]);
    await checkForUpdate();
    expect(mockAlert).toHaveBeenCalledWith('up-to-date', '1.0.6 1.0.6');
  });

  it('stays silent on network errors in the silent check', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('offline')) as jest.Mock;
    await checkForUpdateSilent();
    expect(mockAlert).not.toHaveBeenCalled();
  });
});
