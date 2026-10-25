/**
 * @file accountAuth.ts
 * @description What an account keeps instead of its password (ADR-021): a
 *   device key on Musonic Server (asked once with the password, revocable from
 *   the console), a fixed Subsonic token on other servers, the password only
 *   when a server refuses tokens. Also trades the passwords of accounts saved
 *   by older versions, and revokes the device key at logout.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {Platform} from 'react-native';
import {md5} from 'js-md5';
import {pingServer} from './client';
import {useSettingsStore, type Server} from '../store/settingsStore';

const TIMEOUT_MS = 10000;

/** Server root without trailing slashes or `/rest`. */
function rootOf(url: string): string {
  return url.trim().replace(/\/+$/, '').replace(/\/rest$/, '');
}

/** Name of the key in the console's device list. */
function deviceName(): string {
  const model = (Platform.constants as {Model?: string}).Model;
  return model ? `Musonic Android · ${model}` : 'Musonic Android';
}

/** Random hex salt of the fixed token (not a secret: it travels beside the token). */
function newSalt(): string {
  let salt = '';
  for (let i = 0; i < 24; i++) salt += Math.floor(Math.random() * 16).toString(16);
  return salt;
}

/** One JSON call to the Musonic Server native API. Never log its body: it carries secrets. */
async function musonicApi<T>(server: Server, method: string, path: string, body?: unknown, bearer?: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    const res = await fetch(`${rootOf(server.url)}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} on ${path}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Asks Musonic Server a key for this device with the password, in one short session closed at once. */
export async function obtainDeviceKey(server: Server): Promise<{key: string; id: string}> {
  const {token} = await musonicApi<{token: string}>(server, 'POST', '/v1/auth/login', {
    username: server.username,
    password: server.password,
    client: 'Musonic',
  });
  try {
    const created = await musonicApi<{key: string; info: {id: string}}>(
      server, 'POST', '/v1/me/api-keys', {name: deviceName()}, token,
    );
    return {key: created.key, id: created.info.id};
  } finally {
    musonicApi(server, 'POST', '/v1/auth/logout', undefined, token).catch(() => {});
  }
}

/** Revokes the device key of an account (logout); quiet when the server cannot be reached. */
export async function revokeDeviceKey(server: Server): Promise<void> {
  if (!server.apiKey || !server.apiKeyId) return;
  await musonicApi(server, 'DELETE', `/v1/me/api-keys/${encodeURIComponent(server.apiKeyId)}`, undefined, server.apiKey)
    .catch(() => {});
}

/**
 * What to keep of an account given with its password: a device key on Musonic
 * Server, else a fixed token when the server takes it, else the password.
 * Throws the `PingError` of a wrong password or an unreachable server.
 */
export async function secureAccount(server: Server): Promise<Server> {
  const plain: Server = {id: server.id, name: server.name, url: server.url, username: server.username, password: server.password};
  const {musonic} = await pingServer(plain);
  if (musonic) {
    try {
      const {key, id} = await obtainDeviceKey(plain);
      return {...plain, password: '', apiKey: key, apiKeyId: id};
    } catch {
      // No key this time: the password stays and the next launch tries again.
      return plain;
    }
  }
  const salt = newSalt();
  const withToken: Server = {...plain, password: '', token: md5(plain.password + salt), salt};
  try {
    await pingServer(withToken);
    return withToken;
  } catch {
    // Tokens refused (e.g. a server checking passwords against LDAP): the password stays.
    return plain;
  }
}

let upgrading = false;

/**
 * Trades the password of every saved account for a device key or a token
 * (accounts saved before ADR-021). Offline, refused or not upgradable
 * accounts are left as they are and tried again at the next launch.
 */
export async function upgradeSavedAccounts(): Promise<void> {
  if (upgrading) return;
  upgrading = true;
  try {
    for (const server of useSettingsStore.getState().servers) {
      if (!server.password || server.apiKey || server.token) continue;
      try {
        const secured = await secureAccount(server);
        if (!secured.apiKey && !secured.token) continue;
        // The account may have been removed or changed meanwhile.
        const current = useSettingsStore.getState().servers.find(s => s.id === server.id);
        if (current && current.password === server.password) useSettingsStore.getState().updateServer(secured);
      } catch {
        // Offline or password changed: the usual checks deal with it.
      }
    }
  } finally {
    upgrading = false;
  }
}
