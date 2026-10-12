/**
 * @file auth.ts
 * @description Subsonic token authentication: salt generation and md5 token.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { md5 } from 'js-md5';
import type { SubsonicSession } from './types.ts';

const SALT_BYTES = 12;

/** Random hex salt. A new one is drawn for every login. */
export function createSalt(bytes: number = SALT_BYTES): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** `t` parameter of the Subsonic API: md5(password + salt), lowercase hex. */
export function createToken(password: string, salt: string): string {
  return md5(password + salt);
}

/**
 * Builds a session from the login form. The password only lives in this call:
 * the returned session holds the token, never the password itself.
 */
export function createSession(baseUrl: string, username: string, password: string): SubsonicSession {
  const salt = createSalt();
  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    username: username.trim(),
    token: createToken(password, salt),
    salt,
  };
}

/** Removes trailing slashes and a trailing `/rest` so endpoints can be appended safely. */
export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '').replace(/\/rest$/, '');
}
