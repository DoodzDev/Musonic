/**
 * @file client.ts
 * @description Subsonic API client. Builds authenticated request URLs and exposes
 *   helpers for stream/cover-art URLs. All requests are made against the active
 *   server stored in settingsStore.
 * @author DoodzProg
 * @version 1.0.2
 * @license CC-BY-NC-4.0
 */
import type {Server} from '../store/settingsStore';
import {useNetworkStore} from '../store/networkStore';

const PERMANENT_ERROR_PATTERNS = [
  'ext-deezer',
  // 'media file not found' and 'local track not available' are intentionally
  // excluded — Navidrome returns these transiently before scan completes.
  // LikeRetryManager handles the retry on next playback event.
];

export class SubsonicError extends Error {
  isPermanent: boolean;
  constructor(message: string) {
    super(message);
    this.name = 'SubsonicError';
    this.isPermanent = PERMANENT_ERROR_PATTERNS.some(p =>
      message.toLowerCase().includes(p.toLowerCase()),
    );
  }
}

let _server: Server | null = null;

export function configureClient(server: Server) {
  _server = server;
}

export function getActiveServer(): Server | null {
  return _server;
}

export function getStreamUrl(songId: string): string {
  if (!_server) throw new Error('No server configured');
  const {url, username, password} = _server;
  const base = url.replace(/\/$/, '');
  const p = new URLSearchParams({id: songId, u: username, p: password, v: '1.16.1', c: 'Musonic'});
  return `${base}/rest/stream.view?${p.toString()}`;
}

export function getCoverArtUrl(id: string, size = 300): string {
  if (!_server) throw new Error('No server configured');
  const {url, username, password} = _server;
  const base = url.replace(/\/$/, '');
  const p = new URLSearchParams({id, size: String(size), u: username, p: password, v: '1.16.1', c: 'Musonic'});
  return `${base}/rest/getCoverArt.view?${p.toString()}`;
}

async function fetchWithTimeout(urlStr: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(urlStr, {signal: controller.signal});
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

export async function subsonicGet<T>(
  endpoint: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  if (!_server) throw new Error('No server configured');
  const {url, username, password} = _server;

  const p = new URLSearchParams({u: username, p: password, v: '1.16.1', c: 'Musonic', f: 'json'});
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      v.forEach(item => p.append(k, String(item)));
    } else if (v !== undefined && v !== null) {
      p.append(k, String(v));
    }
  }

  const urlStr = `${url.replace(/\/$/, '')}/rest/${endpoint}?${p.toString()}`;
  try {
    const res = await fetchWithTimeout(urlStr, 10000);
    const store = useNetworkStore.getState();
    store.setOffline(false);
    store.setServerReachable(true);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const body = data['subsonic-response'];
    if (body.status !== 'ok') {
      throw new SubsonicError(body.error?.message ?? 'Subsonic error');
    }
    return body as T;
  } catch (err) {
    if (err instanceof TypeError) {
      useNetworkStore.getState().setOffline(true);
    }
    throw err;
  }
}

export async function pingServer(server: Server): Promise<void> {
  const p = new URLSearchParams({
    u: server.username, p: server.password, v: '1.16.1', c: 'Musonic', f: 'json',
  });
  const urlStr = `${server.url.replace(/\/$/, '')}/rest/ping.view?${p.toString()}`;
  const res = await fetchWithTimeout(urlStr, 8000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const body = data['subsonic-response'];
  if (body.status !== 'ok') {
    throw new Error(body.error?.message ?? 'Auth failed');
  }
}
