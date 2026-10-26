/**
 * @file accountAuth.test.ts
 * @description Accounts keep a device key on Musonic Server and a fixed token
 *   elsewhere, never the password (ADR-021): the URLs carry the key alone, a
 *   server refusing tokens keeps the password, and accounts saved by older
 *   versions are upgraded at launch, quietly when the server cannot be reached,
 *   and the storage file is then wiped of their passwords.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
let mockScrubbed = true;
const mockScrub = jest.fn(async () => {});
jest.mock('../../src/store/storage', () => ({
  storage: {getString: () => undefined, getBoolean: () => mockScrubbed, set: () => {}, delete: () => {}},
  mmkvStorage: {getItem: () => null, setItem: () => {}, removeItem: () => {}},
}));
jest.mock('../../src/store/scrubStorage', () => ({scrubStorage: () => mockScrub()}));
jest.mock('../../src/store/localCovers', () => ({getLocalCoverUri: () => undefined}));
jest.mock('../../src/store/networkStore', () => ({useNetworkStore: {getState: () => ({setOffline: () => {}, setServerReachable: () => {}})}}));
jest.mock('../../src/services/network', () => ({isOnMobileData: () => false}));

import {md5} from 'js-md5';
import {authParams, configureClient, getStreamUrl, subsonicGet} from '../../src/api/client';
import {revokeDeviceKey, secureAccount, upgradeSavedAccounts} from '../../src/api/accountAuth';
import {useSettingsStore, type Server} from '../../src/store/settingsStore';

const account: Server = {id: '1', name: 'm', url: 'https://music.example.com/', username: 'doodz', password: 'secret'};

type Call = {url: string; method: string; headers: Record<string, string>; body?: string};
let calls: Call[] = [];

/** A fake server: `musonic` answers like Musonic Server, `tokens` says whether t+s are accepted. */
function fakeServer(opts: {musonic: boolean; tokens?: boolean; down?: boolean}) {
  calls = [];
  (globalThis as any).fetch = jest.fn(async (url: string, init?: {method?: string; headers?: Record<string, string>; body?: string}) => {
    calls.push({url, method: init?.method ?? 'GET', headers: init?.headers ?? {}, body: init?.body});
    if (opts.down) throw new TypeError('Network request failed');
    const json = (status: number, body: unknown) => ({ok: status < 300, status, json: async () => body});
    if (url.includes('/rest/ping.view')) {
      const q = new URL(url).searchParams;
      const refused = q.has('t') && opts.tokens === false;
      return json(200, {'subsonic-response': refused
        ? {status: 'failed', error: {code: 41, message: 'Token authentication not supported'}}
        : {status: 'ok', ...(opts.musonic ? {type: 'musonic'} : {})}});
    }
    if (url.endsWith('/v1/auth/login')) return json(200, {token: 'session-1', user: {}});
    if (url.endsWith('/v1/me/api-keys')) return json(200, {key: 'msk_device', info: {id: 'k1'}});
    if (url.endsWith('/v1/auth/logout')) return json(200, {});
    if (url.includes('/v1/me/api-keys/')) return json(200, {});
    if (url.includes('/rest/getPlaylists.view')) {
      return json(200, {'subsonic-response': {status: 'failed', error: {code: 44, message: 'Invalid API key'}}});
    }
    return json(404, {});
  });
}

beforeEach(() => {
  useSettingsStore.setState({servers: [], activeServerId: null, authProblem: null});
});

describe('authParams', () => {
  it('sends the device key alone, else the token, else the password', () => {
    expect(authParams({...account, password: '', apiKey: 'msk_x'})).toEqual({apiKey: 'msk_x'});
    expect(authParams({...account, password: '', token: 't0', salt: 's0'})).toEqual({u: 'doodz', t: 't0', s: 's0'});
    expect(authParams(account)).toEqual({u: 'doodz', p: 'secret'});
  });
  it('builds stream URLs without the password once a key is kept', () => {
    configureClient({...account, password: '', apiKey: 'msk_x'});
    const q = new URL(getStreamUrl('song1')).searchParams;
    expect(q.get('apiKey')).toBe('msk_x');
    expect(q.has('u') || q.has('p')).toBe(false);
  });
});

describe('secureAccount', () => {
  it('trades the password for a device key on Musonic Server', async () => {
    fakeServer({musonic: true});
    const secured = await secureAccount(account);
    expect(secured).toMatchObject({password: '', apiKey: 'msk_device', apiKeyId: 'k1'});
    const login = calls.find(c => c.url.endsWith('/v1/auth/login'))!;
    expect(JSON.parse(login.body!)).toMatchObject({username: 'doodz', password: 'secret'});
    expect(calls.find(c => c.url.endsWith('/v1/me/api-keys'))!.headers.Authorization).toBe('Bearer session-1');
    expect(calls.some(c => c.url.endsWith('/v1/auth/logout'))).toBe(true);
  });
  it('keeps a fixed token on another Subsonic server', async () => {
    fakeServer({musonic: false, tokens: true});
    const secured = await secureAccount(account);
    expect(secured.password).toBe('');
    expect(secured.token).toBe(md5('secret' + secured.salt));
  });
  it('keeps the password when the server refuses tokens', async () => {
    fakeServer({musonic: false, tokens: false});
    expect(await secureAccount(account)).toEqual(account);
  });
});

describe('upgradeSavedAccounts', () => {
  it('upgrades accounts saved with a password', async () => {
    fakeServer({musonic: true});
    useSettingsStore.setState({servers: [account]});
    mockScrub.mockClear();
    await upgradeSavedAccounts();
    expect(useSettingsStore.getState().servers[0]).toMatchObject({id: '1', password: '', apiKey: 'msk_device'});
    expect(mockScrub).toHaveBeenCalledTimes(1);
  });
  it('leaves them as they are when the server cannot be reached', async () => {
    fakeServer({musonic: true, down: true});
    useSettingsStore.setState({servers: [account]});
    mockScrub.mockClear();
    await upgradeSavedAccounts();
    expect(useSettingsStore.getState().servers[0]).toEqual(account);
    expect(mockScrub).not.toHaveBeenCalled();
  });
  it('wipes the storage file once for accounts traded by an earlier build', async () => {
    fakeServer({musonic: true});
    useSettingsStore.setState({servers: [{...account, password: '', apiKey: 'msk_old', apiKeyId: 'k0'}]});
    mockScrubbed = false;
    mockScrub.mockClear();
    await upgradeSavedAccounts();
    mockScrubbed = true;
    expect(mockScrub).toHaveBeenCalledTimes(1);
  });
});

describe('a refused account', () => {
  it('signs out with the reason when the key is revoked', async () => {
    fakeServer({musonic: true});
    const keyed = {...account, password: '', apiKey: 'msk_old', apiKeyId: 'k0'};
    useSettingsStore.setState({servers: [keyed], activeServerId: '1'});
    configureClient(keyed);
    await expect(subsonicGet('getPlaylists.view')).rejects.toThrow('Invalid API key');
    const s = useSettingsStore.getState();
    expect(s.activeServerId).toBeNull();
    expect(s.authProblem).toEqual({url: account.url, username: 'doodz', reason: 'revoked'});
  });
  it('revokes the device key at logout', async () => {
    fakeServer({musonic: true});
    await revokeDeviceKey({...account, password: '', apiKey: 'msk_x', apiKeyId: 'k9'});
    const call = calls[0];
    expect([call.method, call.url, call.headers.Authorization]).toEqual(['DELETE', 'https://music.example.com/v1/me/api-keys/k9', 'Bearer msk_x']);
  });
});
