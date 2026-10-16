/**
 * @file pingServer.test.ts
 * @description The server check of the setup screen says why it failed:
 *   wrong credentials, HTTP error, timeout, unreachable, not a Subsonic server.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
jest.mock('../../src/store/storage', () => ({storage: {getString: () => undefined, set: () => {}, delete: () => {}}, mmkvStorage: {getItem: () => null, setItem: () => {}, removeItem: () => {}}}));
jest.mock('../../src/store/localCovers', () => ({getLocalCoverUri: () => undefined}));
jest.mock('../../src/store/networkStore', () => ({useNetworkStore: {getState: () => ({setOffline: () => {}, setServerReachable: () => {}})}}));

import {pingServer, PingError} from '../../src/api/client';

const server = {id: '1', name: 's', url: 'https://music.example.com/', username: 'u', password: 'p'};

function answer(status: number, body?: unknown, badJson = false) {
  (globalThis as any).fetch = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (badJson) throw new SyntaxError('Unexpected token <');
      return body;
    },
  }));
}

async function failure(): Promise<PingError> {
  try {
    await pingServer(server);
  } catch (e) {
    return e as PingError;
  }
  throw new Error('no failure');
}

describe('pingServer', () => {
  it('succeeds on an ok Subsonic answer', async () => {
    answer(200, {'subsonic-response': {status: 'ok'}});
    await expect(pingServer(server)).resolves.toBeUndefined();
  });
  it('reports wrong credentials (Subsonic error 40 or HTTP 401)', async () => {
    answer(200, {'subsonic-response': {status: 'failed', error: {code: 40, message: 'Wrong username or password'}}});
    expect((await failure()).kind).toBe('auth');
    answer(401);
    expect((await failure()).kind).toBe('auth');
  });
  it('reports an HTTP error with its status', async () => {
    answer(404);
    const e = await failure();
    expect([e.kind, e.status]).toEqual(['http', 404]);
  });
  it('reports a page that is not a Subsonic server', async () => {
    answer(200, undefined, true);
    expect((await failure()).kind).toBe('notSubsonic');
    answer(200, {other: true});
    expect((await failure()).kind).toBe('notSubsonic');
  });
  it('reports a timeout and an unreachable server', async () => {
    (globalThis as any).fetch = jest.fn(async () => { throw Object.assign(new Error('aborted'), {name: 'AbortError'}); });
    expect((await failure()).kind).toBe('timeout');
    (globalThis as any).fetch = jest.fn(async () => { throw new TypeError('Network request failed'); });
    expect((await failure()).kind).toBe('unreachable');
  });
});
