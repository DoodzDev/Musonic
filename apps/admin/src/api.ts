/**
 * @file api.ts
 * @description Calls to the Musonic Server native API (`/v1`, same address as the console),
 *   signed in with a session token kept in this browser. Types come from the server
 *   (generated into @musonic/core).
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { t } from './i18n/index.ts';

const TOKEN_KEY = 'musonic.admin.session';

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const session = {
  get token(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // Private browsing: signed in for this page only.
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Nothing kept.
    }
  },
};

/** Calls `path` (JSON in and out). A 401 ends the session. */
export async function api<T>(path: string, options: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = session.token;
  if (token && options.auth !== false) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(path, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, t.common.noAnswer);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    if (res.status === 401 && options.auth !== false) session.clear();
    throw new ApiError(res.status, data.error ?? t.common.error(res.status));
  }
  return data as T;
}

/** Address of a link the console creates (invitation, password reset). */
export function linkUrl(kind: 'invite' | 'reset', token: string): string {
  return `${location.origin}/${kind}/${token}`;
}
