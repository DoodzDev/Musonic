/**
 * @file musonicApi.ts
 * @description Musonic Server's native API (`/v1`), for what Subsonic cannot do (importing
 *   playlists…). Only when the server is a Musonic Server (`/v1/info`). The session is
 *   opened with the Subsonic token the web client already keeps (never the password) and
 *   kept for the tab.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useState } from 'react';
import type { ServerInfo, SubsonicSession } from '@musonic/core';
import { transportBaseUrl } from './session.ts';

const TOKEN_KEY = 'musonic.v1';

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function base(session: SubsonicSession): string {
  return transportBaseUrl(session.baseUrl).replace(/\/+$/, '');
}

const infos = new Map<string, Promise<boolean>>();

/** Whether the server is a Musonic Server (asked once per address). */
export function isMusonicServer(session: SubsonicSession): Promise<boolean> {
  const url = base(session);
  let known = infos.get(url);
  if (!known) {
    known = fetch(`${url}/v1/info`)
      .then((r) => (r.ok ? (r.json() as Promise<ServerInfo>) : null))
      .then((info) => info?.server === 'musonic')
      .catch(() => false);
    infos.set(url, known);
  }
  return known;
}

/** `true` once the server is known to be a Musonic Server, `false` when not, `undefined` while asking. */
export function useMusonicServer(session: SubsonicSession): boolean | undefined {
  const [is, setIs] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void isMusonicServer(session).then((v) => alive && setIs(v));
    return () => {
      alive = false;
    };
  }, [session]);
  return is;
}

function tokenKey(session: SubsonicSession): string {
  return `${TOKEN_KEY}|${session.baseUrl}|${session.username}`;
}

async function signIn(session: SubsonicSession): Promise<string> {
  const res = await fetch(`${base(session)}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: session.username, token: session.token, salt: session.salt, client: 'Musonic Web' }),
  });
  if (!res.ok) throw new ApiError(res.status, 'sign-in refused');
  const { token } = (await res.json()) as { token: string };
  try {
    sessionStorage.setItem(tokenKey(session), token);
  } catch {
    // Kept in memory only: signed in again next time.
  }
  return token;
}

function savedToken(session: SubsonicSession): string | null {
  try {
    return sessionStorage.getItem(tokenKey(session));
  } catch {
    return null;
  }
}

/** Calls `path` (JSON in and out); signs in again once when the session ended. */
export async function v1<T>(session: SubsonicSession, path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const send = async (token: string) => {
    try {
      return await fetch(`${base(session)}${path}`, {
        method: options.method ?? 'GET',
        headers: { Authorization: `Bearer ${token}`, ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch {
      throw new ApiError(0, 'no answer');
    }
  };
  let res = await send(savedToken(session) ?? (await signIn(session)));
  if (res.status === 401) res = await send(await signIn(session));
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `error ${res.status}`);
  return data as T;
}
