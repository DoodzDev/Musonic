/**
 * @file scrobbling.ts
 * @description Scrobbling on Musonic Server (version 5): the account's ListenBrainz
 *   and Last.fm connections. Plays are sent by the server itself; the app only
 *   connects the accounts (a ListenBrainz token; Last.fm through its page in the
 *   browser) and shows their state.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {useSettingsStore, type Server} from '../store/settingsStore';

export type ScrobbleService = 'listenbrainz' | 'lastfm';
export type ServiceState = {connected: boolean; name: string | null; problem: string | null; pending: number; available?: boolean};
export type ScrobblingState = Record<ScrobbleService, ServiceState>;

export class ScrobblingError extends Error {
  constructor(public status: number) {
    super(`scrobbling ${status}`);
  }
}

function activeServer(): Server | null {
  const {servers, activeServerId} = useSettingsStore.getState();
  return servers.find(s => s.id === activeServerId) ?? null;
}

/** The server's own address, as Last.fm must send the browser back to it. */
function serverUrl(server: Server): string {
  return server.url.replace(/\/+$/, '').replace(/\/rest$/, '');
}

async function v1<T>(path: string, init: {method?: string; body?: unknown} = {}): Promise<T> {
  const server = activeServer();
  if (!server?.apiKey) throw new ScrobblingError(0);
  let res: Response;
  try {
    res = await fetch(`${serverUrl(server)}${path}`, {
      method: init.method ?? 'GET',
      headers: {Authorization: `Bearer ${server.apiKey}`, ...(init.body === undefined ? {} : {'Content-Type': 'application/json'})},
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ScrobblingError(0);
  }
  if (!res.ok) throw new ScrobblingError(res.status);
  return (await res.json()) as T;
}

/** The account's services; fails (404) on a server without scrobbling. */
export function scrobblingStatus(): Promise<ScrobblingState> {
  return v1<ScrobblingState>('/v1/me/scrobbling');
}

/** Checks the token with ListenBrainz (422 when refused), then keeps it. */
export function connectListenBrainz(token: string): Promise<ScrobblingState> {
  return v1<ScrobblingState>('/v1/me/scrobbling/listenbrainz', {method: 'PUT', body: {token: token.trim()}});
}

/** The Last.fm page where the user allows Musonic; Last.fm then sends the browser back to the server. */
export async function lastfmSignInUrl(): Promise<string> {
  const server = activeServer();
  if (!server) throw new ScrobblingError(0);
  const {url} = await v1<{url: string}>('/v1/me/scrobbling/lastfm', {method: 'POST', body: {serverUrl: serverUrl(server)}});
  return url;
}

export function disconnectScrobbling(service: ScrobbleService): Promise<ScrobblingState> {
  return v1<ScrobblingState>(`/v1/me/scrobbling/${service}`, {method: 'DELETE'});
}
