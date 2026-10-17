/**
 * @file musonicApi.ts
 * @description Optional Musonic API (ADR-016, step A). When it is set up in
 *   Settings and answers, Deezer tracks (`ext-deezer-song-{id}`) are streamed
 *   through it instead of OctoFiesta: playback starts as soon as the first
 *   megabyte arrives. Without it, or when it does not answer, nothing changes.
 *   The stream URL carries the API key: build it in memory only, never persist
 *   or log it.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {useSettingsStore} from '../store/settingsStore';

const TIMEOUT_MS = 5000;
/** The answer of the last check is trusted this long, then checked again in the background. */
const RECHECK_MS = 5 * 60 * 1000;
const EXT_DEEZER_SONG = /^ext-deezer-song-(\d+)$/;

export type MusonicApiStatus = 'ok' | 'unauthorized' | 'unreachable' | 'notConfigured';

let reachable = false;
let lastCheck = 0;

/** URL (without trailing slash) and key, or null when not set up. */
export function musonicApiConfig(): {url: string; key: string} | null {
  const {musonicApiUrl, musonicApiKey} = useSettingsStore.getState();
  const url = musonicApiUrl.trim().replace(/\/+$/, '');
  const key = musonicApiKey.trim();
  return url && key ? {url, key} : null;
}

/** Set up and answering at the last check (a stale answer starts a new check). */
export function isMusonicApiActive(): boolean {
  if (musonicApiConfig() === null) return false;
  if (Date.now() - lastCheck > RECHECK_MS) checkMusonicApi();
  return reachable;
}

/** Deezer track id of an OctoFiesta `ext-deezer-song-{id}` song id, else null. */
export function deezerSongId(songId: string): string | null {
  return EXT_DEEZER_SONG.exec(songId)?.[1] ?? null;
}

/** Stream URL of a Deezer track through the API. Carries the key: never persist or log it. */
export function musonicStreamUrl(deezerId: string): string {
  const cfg = musonicApiConfig();
  if (!cfg) throw new Error('Musonic API not configured');
  return `${cfg.url}/v1/stream/deezer:${deezerId}?key=${encodeURIComponent(cfg.key)}`;
}

/**
 * Checks the API with the saved settings, or with `candidate` before saving
 * them. Only a check of the saved settings changes what playback uses.
 */
export async function checkMusonicApi(candidate?: {url: string; key: string}): Promise<MusonicApiStatus> {
  const cfg = candidate
    ? {url: candidate.url.trim().replace(/\/+$/, ''), key: candidate.key.trim()}
    : musonicApiConfig();
  if (!candidate) lastCheck = Date.now();
  const status = await probe(cfg);
  if (!candidate) reachable = status === 'ok';
  return status;
}

async function probe(cfg: {url: string; key: string} | null): Promise<MusonicApiStatus> {
  if (!cfg || !cfg.url || !cfg.key) return 'notConfigured';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.url}/v1/status`, {headers: {'X-Api-Key': cfg.key}, signal: controller.signal});
    if (res.status === 401) return 'unauthorized';
    return res.ok ? 'ok' : 'unreachable';
  } catch {
    return 'unreachable';
  } finally {
    clearTimeout(timer);
  }
}
