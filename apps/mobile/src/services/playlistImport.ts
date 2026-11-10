/**
 * @file playlistImport.ts
 * @description Playlist import from the app (Spotify, Deezer, YouTube Music…,
 *   ADR-020 / ADR-029): the link goes to Musonic Server, which imports in the
 *   background; the progress is polled and shown by the top banner
 *   (`ImportBanner`), the playlist appears in the library once done.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {create} from 'zustand';
import {useSettingsStore, type Server} from '../store/settingsStore';
import {toast} from '../components/ui/Toast';
import {getT} from '../i18n';

const POLL_MS = 2000;

type Progress = {id: string; name: string; done: number; total: number};

type ImportState = {
  /** The import running, for the banner; null when none. */
  active: Progress | null;
  /** Bumped when an import ends: the library reloads its playlists. */
  finishedAt: number;
};

export const useImportStore = create<ImportState>(() => ({active: null, finishedAt: 0}));

type ServerImport = {id: string; name: string; state: string; done: number; total: number; error?: string | null};

function activeServer(): Server | null {
  const {servers, activeServerId} = useSettingsStore.getState();
  return servers.find(s => s.id === activeServerId) ?? null;
}

/** Imports need Musonic Server (the device key opens its /v1 API). */
export function canImportPlaylists(): boolean {
  return !!activeServer()?.apiKey;
}

class ImportError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function v1<T>(server: Server, path: string, init: {method?: string; body?: unknown} = {}): Promise<T> {
  const res = await fetch(`${server.url.replace(/\/+$/, '').replace(/\/rest$/, '')}${path}`, {
    method: init.method ?? 'GET',
    headers: {Authorization: `Bearer ${server.apiKey}`, ...(init.body === undefined ? {} : {'Content-Type': 'application/json'})},
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) throw new ImportError(res.status, await res.text().catch(() => ''));
  return (await res.json()) as T;
}

/** What to tell the user when the server refuses a link. */
function errorText(e: unknown): string {
  const t = getT().playlistImport;
  if (!(e instanceof ImportError)) return t.errors.unavailable;
  const m = e.message;
  if (e.status === 400) return t.errors.notPlaylist;
  if (e.status === 404) return t.errors.notFound;
  if (e.status === 429) return t.errors.busy;
  if (e.status === 501) return m.includes('spotify') ? t.errors.spotify : t.errors.unavailable;
  if (e.status === 422) {
    if (m.includes('albums')) return t.errors.youtubeAlbum;
    if (m.includes('liked')) return t.errors.youtubeLiked;
    if (m.includes('mixes')) return t.errors.youtubeMix;
    if (m.includes('API key')) return t.errors.youtubeKey;
    return t.errors.youtubeNotPlaylist;
  }
  return t.errors.unavailable;
}

function follow(server: Server, id: string): void {
  const tick = () => {
    v1<{import: ServerImport} | ServerImport>(server, `/v1/playlist-imports/${encodeURIComponent(id)}`)
      .then(r => {
        const imp = 'import' in r ? r.import : r;
        if (imp.state === 'done' || imp.state === 'failed') {
          const t = getT().playlistImport;
          useImportStore.setState({active: null, finishedAt: Date.now()});
          if (imp.state === 'done') toast.success(t.done(imp.name));
          else toast.error(t.failed(imp.name));
          return;
        }
        useImportStore.setState({active: {id, name: imp.name, done: imp.done, total: imp.total}});
        setTimeout(tick, POLL_MS);
      })
      // Network hiccup: try again a little later, the server keeps importing.
      .catch(() => setTimeout(tick, POLL_MS * 3));
  };
  tick();
}

/** Sends a playlist link to import. Resolves with an error message, or null once started. */
export async function startPlaylistImport(url: string): Promise<string | null> {
  const server = activeServer();
  if (!server?.apiKey) return getT().playlistImport.errors.unavailable;
  try {
    const started = await v1<ServerImport>(server, '/v1/playlist-imports', {method: 'POST', body: {url: url.trim()}});
    useImportStore.setState({active: {id: started.id, name: started.name, done: 0, total: started.total}});
    follow(server, started.id);
    return null;
  } catch (e) {
    return errorText(e);
  }
}
