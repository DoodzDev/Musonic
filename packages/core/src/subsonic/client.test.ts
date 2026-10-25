/**
 * @file client.test.ts
 * @description Tests for Subsonic token authentication, Musonic Server device
 *   keys (ADR-021) and the API client.
 * @author DoodzProg
 * @version 0.2.0
 * @license CC-BY-NC-4.0
 */

import { describe, expect, it } from 'vitest';
import { createSalt, createSession, createToken, normalizeBaseUrl } from './auth.ts';
import { SubsonicClient, SubsonicError, type AuthProblemReason } from './client.ts';
import { createDeviceKeySession, revokeDeviceKey } from './deviceKey.ts';

const session = { baseUrl: 'https://music.example.com', username: 'doodz', token: 'abc', salt: 'def' };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('auth', () => {
  it('matches the token example of the Subsonic documentation', () => {
    expect(createToken('sesame', 'c19b2d')).toBe('26719a1196d2a940705a59634eb18eab');
  });

  it('draws a different hex salt each time', () => {
    const a = createSalt();
    const b = createSalt();
    expect(a).toMatch(/^[0-9a-f]{24}$/);
    expect(a).not.toBe(b);
  });

  it('never keeps the password in the session', () => {
    const s = createSession('https://music.example.com/', ' doodz ', 'sesame');
    expect(JSON.stringify(s)).not.toContain('sesame');
    expect(s.username).toBe('doodz');
    expect(s.token).toBe(createToken('sesame', s.salt));
  });

  it('normalizes the server address', () => {
    expect(normalizeBaseUrl(' https://music.example.com/rest/ ')).toBe('https://music.example.com');
    expect(normalizeBaseUrl('')).toBe('');
  });
});

describe('SubsonicClient', () => {
  it('builds URLs with token auth and no clear password', () => {
    const url = new URL(new SubsonicClient(session).buildUrl('getPlaylist', { id: '42', size: undefined }));
    expect(url.pathname).toBe('/rest/getPlaylist.view');
    expect(url.searchParams.get('t')).toBe('abc');
    expect(url.searchParams.get('s')).toBe('def');
    expect(url.searchParams.get('f')).toBe('json');
    expect(url.searchParams.get('id')).toBe('42');
    expect(url.searchParams.has('p')).toBe(false);
    expect(url.searchParams.has('size')).toBe(false);
  });

  it('supports a same-origin base URL (development proxy)', () => {
    const url = new SubsonicClient({ ...session, baseUrl: '' }).buildUrl('ping');
    expect(url.startsWith('/rest/ping.view?')).toBe(true);
  });

  it('returns playlists and defaults to an empty list', async () => {
    const client = new SubsonicClient(session, async () =>
      jsonResponse({ 'subsonic-response': { status: 'ok', playlists: { playlist: [{ id: '1', name: 'A', songCount: 2, duration: 300 }] } } }),
    );
    expect(await client.getPlaylists()).toHaveLength(1);
    const empty = new SubsonicClient(session, async () => jsonResponse({ 'subsonic-response': { status: 'ok', playlists: {} } }));
    expect(await empty.getPlaylists()).toEqual([]);
  });

  it('maps a failed response to an auth error without leaking the URL', async () => {
    const client = new SubsonicClient(session, async () =>
      jsonResponse({ 'subsonic-response': { status: 'failed', error: { code: 40, message: 'Wrong username or password' } } }),
    );
    const error = await client.ping().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SubsonicError);
    expect((error as SubsonicError).isAuthError).toBe(true);
    expect((error as SubsonicError).message).not.toContain('abc');
  });

  it('treats an HTTP 401 from a proxy as an auth error', async () => {
    const client = new SubsonicClient(session, async () => new Response('', { status: 401 }));
    const error = (await client.ping().catch((e: unknown) => e)) as SubsonicError;
    expect(error.status).toBe(401);
    expect(error.isAuthError).toBe(true);
  });

  it('reports an unreachable server', async () => {
    const client = new SubsonicClient(session, async () => {
      throw new TypeError('fetch failed');
    });
    const error = (await client.ping().catch((e: unknown) => e)) as SubsonicError;
    expect(error.message).toBe('Server unreachable');
    expect(error.isUnreachable).toBe(true);
  });

  it('treats a gateway error as an unreachable server', async () => {
    const client = new SubsonicClient(session, async () => new Response('', { status: 502 }));
    const error = (await client.ping().catch((e: unknown) => e)) as SubsonicError;
    expect(error.isUnreachable).toBe(true);
    expect(error.isAuthError).toBe(false);
  });

  it('replaces the songs of a playlist in order', async () => {
    let url = '';
    const client = new SubsonicClient(session, async (input) => {
      url = input;
      return jsonResponse({ 'subsonic-response': { status: 'ok' } });
    });
    await client.replacePlaylistSongs('p1', ['b', 'a', 'b']);
    const q = new URL(url).searchParams;
    expect(new URL(url).pathname).toBe('/rest/createPlaylist.view');
    expect([q.get('playlistId'), q.getAll('songId')]).toEqual(['p1', ['b', 'a', 'b']]);
  });

  it('sends a device key alone', () => {
    const url = new URL(new SubsonicClient({ ...session, token: '', salt: '', apiKey: 'msk_x' }).buildUrl('ping'));
    expect(url.searchParams.get('apiKey')).toBe('msk_x');
    expect(['u', 't', 's', 'p'].some((k) => url.searchParams.has(k))).toBe(false);
  });

  it('tells a Musonic Server apart', async () => {
    const answer = (extra: object) => new SubsonicClient(session, async () => jsonResponse({ 'subsonic-response': { status: 'ok', ...extra } }));
    expect(await answer({ type: 'musonic' }).ping()).toEqual({ musonic: true });
    expect(await answer({ type: 'navidrome' }).ping()).toEqual({ musonic: false });
  });

  it('reports a refused account, not a refused action', async () => {
    const seen: AuthProblemReason[] = [];
    const failing = (code: number, message: string) =>
      new SubsonicClient(session, async () => jsonResponse({ 'subsonic-response': { status: 'failed', error: { code, message } } }), {
        onAuthProblem: (r) => seen.push(r),
      });
    await failing(44, 'Invalid API key').ping().catch(() => {});
    await failing(50, "This account is suspended: ask the server's administrator").ping().catch(() => {});
    await failing(40, 'Wrong username or password').ping().catch(() => {});
    await failing(50, 'Only the owner can change this playlist').ping().catch(() => {});
    await failing(70, 'Not found').ping().catch(() => {});
    expect(seen).toEqual(['revoked', 'suspended', 'credentials']);
  });
});

describe('device keys', () => {
  type Call = { url: string; method?: string; auth?: string; body?: string };

  function server(loginStatus = 200) {
    const calls: Call[] = [];
    const fetchImpl = async (url: string, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url, method: init?.method, auth: headers.Authorization, body: init?.body as string | undefined });
      if (url.endsWith('/v1/auth/login')) return jsonResponse(loginStatus === 200 ? { token: 'session-1' } : { error: 'no' }, loginStatus);
      if (url.endsWith('/v1/me/api-keys')) return jsonResponse({ key: 'msk_device', info: { id: 'k1' } });
      return jsonResponse({});
    };
    return { calls, fetchImpl };
  }

  it('trades the password for a key and closes the short session', async () => {
    const { calls, fetchImpl } = server();
    const s = await createDeviceKeySession('https://music.example.com/', ' doodz ', 'sesame', 'Musonic Web · Firefox', { fetchImpl });
    expect(s).toEqual({ baseUrl: 'https://music.example.com', username: 'doodz', token: '', salt: '', apiKey: 'msk_device', apiKeyId: 'k1' });
    expect(JSON.stringify(s)).not.toContain('sesame');
    expect(calls[1]).toMatchObject({ url: 'https://music.example.com/v1/me/api-keys', auth: 'Bearer session-1' });
    await Promise.resolve();
    expect(calls.some((c) => c.url.endsWith('/v1/auth/logout'))).toBe(true);
  });

  it('calls the transport address and fails on a wrong password', async () => {
    const { calls, fetchImpl } = server(401);
    const error = (await createDeviceKeySession('https://music.example.com', 'doodz', 'bad', 'x', {
      fetchImpl,
      transportUrl: '/__relay/https/music.example.com',
    }).catch((e: unknown) => e)) as SubsonicError;
    expect(error.status).toBe(401);
    expect(error.isAuthError).toBe(true);
    expect(calls[0].url).toBe('/__relay/https/music.example.com/v1/auth/login');
  });

  it('revokes the key with itself', async () => {
    const { calls, fetchImpl } = server();
    await revokeDeviceKey({ ...session, apiKey: 'msk_x', apiKeyId: 'k9' }, { fetchImpl });
    expect(calls[0]).toMatchObject({ method: 'DELETE', url: 'https://music.example.com/v1/me/api-keys/k9', auth: 'Bearer msk_x' });
    await revokeDeviceKey(session, { fetchImpl });
    expect(calls).toHaveLength(1);
  });
});
