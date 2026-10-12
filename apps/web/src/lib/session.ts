/**
 * @file session.ts
 * @description Keeps the Subsonic session for the lifetime of the browser tab.
 * @author DoodzProg
 * @version 0.2.0
 * @license CC-BY-NC-4.0
 */

import type { SubsonicSession } from '@musonic/core';

const SESSION_KEY = 'musonic.session';
const LAST_SERVER_KEY = 'musonic.lastServer';

// sessionStorage, not localStorage: the token is a reusable credential, so it
// is dropped when the tab closes. The clear password is never stored.
export function loadSession(): SubsonicSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<SubsonicSession>;
    if (typeof s.baseUrl !== 'string' || typeof s.username !== 'string' || typeof s.token !== 'string' || typeof s.salt !== 'string') {
      return null;
    }
    return { baseUrl: s.baseUrl, username: s.username, token: s.token, salt: s.salt };
  } catch {
    return null;
  }
}

export function saveSession(session: SubsonicSession): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    localStorage.setItem(LAST_SERVER_KEY, session.baseUrl);
  } catch {
    // Storage can be unavailable (private mode): the session then lasts until reload.
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** Last server address used on this browser, to prefill the login form. Not a secret. */
export function loadLastServer(): string {
  try {
    return localStorage.getItem(LAST_SERVER_KEY) ?? '';
  } catch {
    return '';
  }
}

/**
 * Address the browser actually calls. In development every request goes
 * through the Vite relay (see vite.config.ts), because some servers send no
 * CORS headers. In production the server address is used as is.
 */
export function transportBaseUrl(baseUrl: string): string {
  if (!import.meta.env.DEV) return baseUrl;
  try {
    const url = new URL(baseUrl);
    return `/__relay/${url.protocol.replace(':', '')}/${url.host}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return baseUrl;
  }
}

/** Session as seen by the API client: same credentials, transport address. */
export function transportSession(session: SubsonicSession): SubsonicSession {
  return { ...session, baseUrl: transportBaseUrl(session.baseUrl) };
}
