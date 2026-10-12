/**
 * @file client.test.ts
 * @description Tests for Subsonic token authentication and the API client.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { describe, expect, it } from 'vitest';
import { createSalt, createSession, createToken, normalizeBaseUrl } from './auth.ts';
import { SubsonicClient, SubsonicError } from './client.ts';

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
});
