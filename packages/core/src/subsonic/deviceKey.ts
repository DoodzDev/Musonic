/**
 * @file deviceKey.ts
 * @description Musonic Server device keys (ADR-021): asked once with the
 *   password, then the client keeps only the key, which the console lists and
 *   can revoke. Revoked at logout.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { normalizeBaseUrl } from './auth.ts';
import { SubsonicError } from './client.ts';
import type { SubsonicSession } from './types.ts';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const defaultFetch: FetchLike = (input, init) => fetch(input, init);

/** One JSON call to the native API. Never log its body: it carries secrets. */
async function call<T>(fetchImpl: FetchLike, url: string, method: string, body?: unknown, bearer?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  let res: Response;
  try {
    res = await fetchImpl(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new SubsonicError('Server unreachable', { unreachable: true });
  }
  if (!res.ok) throw new SubsonicError(`HTTP ${res.status}`, { status: res.status });
  return (await res.json()) as T;
}

/**
 * Session holding a device key for `username`, asked with the password in one
 * short native session closed at once. `transportUrl` is the address actually
 * called (a development relay), `baseUrl` the one kept in the session.
 * Wrong password: `SubsonicError` with status 401; suspended account: 403.
 */
export async function createDeviceKeySession(
  baseUrl: string,
  username: string,
  password: string,
  deviceName: string,
  options: { transportUrl?: string; fetchImpl?: FetchLike } = {},
): Promise<SubsonicSession> {
  const root = normalizeBaseUrl(options.transportUrl ?? baseUrl);
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const { token } = await call<{ token: string }>(fetchImpl, `${root}/v1/auth/login`, 'POST', {
    username: username.trim(),
    password,
    client: deviceName,
  });
  try {
    const created = await call<{ key: string; info: { id: string } }>(
      fetchImpl, `${root}/v1/me/api-keys`, 'POST', { name: deviceName }, token,
    );
    return {
      baseUrl: normalizeBaseUrl(baseUrl),
      username: username.trim(),
      token: '',
      salt: '',
      apiKey: created.key,
      apiKeyId: created.info.id,
    };
  } finally {
    call(fetchImpl, `${root}/v1/auth/logout`, 'POST', undefined, token).catch(() => {});
  }
}

/** Revokes the device key of a session (logout); quiet when the server cannot be reached. */
export async function revokeDeviceKey(
  session: SubsonicSession,
  options: { transportUrl?: string; fetchImpl?: FetchLike } = {},
): Promise<void> {
  if (!session.apiKey || !session.apiKeyId) return;
  const root = normalizeBaseUrl(options.transportUrl ?? session.baseUrl);
  await call(
    options.fetchImpl ?? defaultFetch,
    `${root}/v1/me/api-keys/${encodeURIComponent(session.apiKeyId)}`,
    'DELETE',
    undefined,
    session.apiKey,
  ).catch(() => {});
}
