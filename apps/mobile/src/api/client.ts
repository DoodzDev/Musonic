/**
 * @file client.ts
 * @description Subsonic API client. Builds authenticated request URLs and exposes
 *   helpers for stream/cover-art URLs. All requests are made against the active
 *   server stored in settingsStore. Streams follow the quality chosen for the
 *   current network (Wi-Fi or mobile data); downloads always get the original.
 *   Deezer tracks are streamed through the Musonic API when it answers (ADR-016).
 * @author DoodzProg
 * @version 1.4.0
 * @license CC-BY-NC-4.0
 */
import {useSettingsStore, type Server} from '../store/settingsStore';
import {isOnMobileData} from '../services/network';
import {useNetworkStore} from '../store/networkStore';
import {getLocalCoverUri} from '../store/localCovers';
import {deezerSongId, isMusonicApiActive, musonicStreamUrl} from './musonicApi';

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

/** Streaming bitrate cap for the current network, in kbit/s (0 = original). */
function streamQuality(): number {
  const s = useSettingsStore.getState();
  return isOnMobileData() ? s.streamQualityMobile : s.streamQualityWifi;
}

/** Stream URL; `original` skips the quality cap (downloads). */
export function getStreamUrl(songId: string, options?: {original?: boolean}): string {
  // Deezer tracks go through the Musonic API when it answers (ADR-016, step A).
  const deezerId = deezerSongId(songId);
  if (deezerId && isMusonicApiActive()) return musonicStreamUrl(deezerId);
  if (!_server) throw new Error('No server configured');
  const {url, username, password} = _server;
  const base = url.replace(/\/$/, '');
  const p = new URLSearchParams({id: songId, u: username, p: password, v: '1.16.1', c: 'Musonic'});
  const quality = options?.original ? 0 : streamQuality();
  // Navidrome transcodes down to this bitrate; files already below it are sent as is.
  if (quality > 0) p.set('maxBitRate', String(quality));
  return `${base}/rest/stream.view?${p.toString()}`;
}

/**
 * Cover art URI: the file saved with a downloaded track when there is one
 * (works offline, whatever the size asked), else the server URL.
 */
export function getCoverArtUrl(id: string, size = 300): string {
  return getLocalCoverUri(id) ?? getRemoteCoverArtUrl(id, size);
}

/** Server cover art URL. Carries the account credentials: never persist or log it. */
export function getRemoteCoverArtUrl(id: string, size = 300): string {
  if (!_server) throw new Error('No server configured');
  const {url, username, password} = _server;
  const base = url.replace(/\/$/, '');
  const p = new URLSearchParams({id, size: String(size), u: username, p: password, v: '1.16.1', c: 'Musonic'});
  return `${base}/rest/getCoverArt.view?${p.toString()}`;
}

async function fetchWithTimeout(urlStr: string, timeoutMs: number, headers?: Record<string, string>): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(urlStr, {signal: controller.signal, headers});
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/** URL of a Subsonic route with the account's credentials. Never persist or log it. */
function restUrl(endpoint: string, params: Record<string, unknown>): string {
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
  return `${url.replace(/\/$/, '')}/rest/${endpoint}?${p.toString()}`;
}

/** The Subsonic answer of a response, or a `SubsonicError`. */
async function subsonicBody<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const body = data['subsonic-response'];
  if (body.status !== 'ok') {
    throw new SubsonicError(body.error?.message ?? 'Subsonic error');
  }
  return body as T;
}

async function subsonicFetch(urlStr: string, timeoutMs: number, headers?: Record<string, string>): Promise<Response> {
  try {
    const res = await fetchWithTimeout(urlStr, timeoutMs, headers);
    const store = useNetworkStore.getState();
    store.setOffline(false);
    store.setServerReachable(true);
    return res;
  } catch (err) {
    if (err instanceof TypeError) {
      useNetworkStore.getState().setOffline(true);
    }
    throw err;
  }
}

export async function subsonicGet<T>(
  endpoint: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  return subsonicBody<T>(await subsonicFetch(restUrl(endpoint, params), 10000));
}

/**
 * Like `subsonicGet`, sending the `ETag` of the copy the app already has: `null` when the
 * server answers 304 (unchanged, nothing downloaded). Musonic Server keeps such answers.
 */
export async function subsonicGetIfChanged<T>(
  endpoint: string,
  params: Record<string, unknown> = {},
  etag?: string,
  timeoutMs = 20000,
): Promise<{body: T; etag?: string} | null> {
  const res = await subsonicFetch(restUrl(endpoint, params), timeoutMs, etag ? {'If-None-Match': etag} : undefined);
  if (res.status === 304) return null;
  const body = await subsonicBody<T>(res);
  return {body, etag: res.headers.get('etag') ?? undefined};
}

/** Why a server could not be reached, so the setup screen can say it plainly (F29). */
export type PingFailure = 'auth' | 'http' | 'timeout' | 'unreachable' | 'notSubsonic' | 'server';

export class PingError extends Error {
  kind: PingFailure;
  /** HTTP status (`http`, `auth`). */
  status?: number;
  constructor(kind: PingFailure, message: string, status?: number) {
    super(message);
    this.name = 'PingError';
    this.kind = kind;
    this.status = status;
  }
}

/** Checks a server and its credentials; throws a `PingError` saying why it failed. */
export async function pingServer(server: Server): Promise<void> {
  const p = new URLSearchParams({
    u: server.username, p: server.password, v: '1.16.1', c: 'Musonic', f: 'json',
  });
  const urlStr = `${server.url.replace(/\/$/, '')}/rest/ping.view?${p.toString()}`;
  let res: Response;
  try {
    res = await fetchWithTimeout(urlStr, 8000);
  } catch (err) {
    const aborted = (err as {name?: string})?.name === 'AbortError';
    throw new PingError(aborted ? 'timeout' : 'unreachable', String((err as Error)?.message ?? err));
  }
  if (res.status === 401 || res.status === 403) throw new PingError('auth', `HTTP ${res.status}`, res.status);
  if (!res.ok) throw new PingError('http', `HTTP ${res.status}`, res.status);
  let body: any;
  try {
    body = (await res.json())?.['subsonic-response'];
  } catch {
    body = undefined;
  }
  // A web page or another API answered: not a Subsonic server at this address.
  if (!body) throw new PingError('notSubsonic', 'Not a Subsonic response');
  if (body.status !== 'ok') {
    // Subsonic error 40: wrong username or password.
    const kind = body.error?.code === 40 ? 'auth' : 'server';
    throw new PingError(kind, body.error?.message ?? 'Auth failed');
  }
}
