/**
 * @file lrclib.ts
 * @description Lyrics from LRCLIB (https://lrclib.net), the public fallback when
 *   the music server has none (most files carry no embedded lyrics). Synced
 *   lyrics are preferred, plain text otherwise. Same rules as the mobile app.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import type { StructuredLyrics } from '../subsonic/types.ts';

const LRCLIB_URL = 'https://lrclib.net/api';
const DURATION_TOLERANCE_S = 3;

interface LrclibRecord {
  duration?: number;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

/** Parses LRC text ("[mm:ss.xx] words") into lines with a start time in milliseconds. */
export function parseLrc(lrc: string): StructuredLyrics['line'] {
  const lines: StructuredLyrics['line'] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const m = raw.match(/^\[(\d{1,2}):(\d{2})\.(\d{2,3})\](.*)/);
    if (!m) continue;
    const start = (Number(m[1]) * 60 + Number(m[2])) * 1000 + Number(m[3].padEnd(3, '0'));
    const value = m[4].trim();
    if (value) lines.push({ start, value });
  }
  return lines;
}

function plainLines(text: string): StructuredLyrics['line'] {
  return text
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => ({ value }));
}

/**
 * Picks the best lyrics among LRCLIB records: the synced ones whose duration is
 * closest to the track's (within 3 s when the duration is known), else plain text.
 */
export function pickLrclib(records: LrclibRecord[], duration?: number): StructuredLyrics | null {
  const synced = records.filter(
    (r) => r.syncedLyrics && (duration == null || Math.abs(Number(r.duration) - duration) <= DURATION_TOLERANCE_S),
  );
  if (duration != null) synced.sort((a, b) => Math.abs(Number(a.duration) - duration) - Math.abs(Number(b.duration) - duration));
  for (const r of synced) {
    const line = parseLrc(String(r.syncedLyrics));
    if (line.length) return { synced: true, line };
  }
  for (const r of records) {
    const line = r.plainLyrics ? plainLines(r.plainLyrics) : [];
    if (line.length) return { synced: false, line };
  }
  return null;
}

/**
 * Looks the track up on LRCLIB. `/get` returns one best match, sometimes a
 * plain-only release while another release is synced, so `/search` is tried too.
 * Returns null when nothing is found or LRCLIB is unreachable. No custom
 * header: a simple request needs no CORS preflight, which some browsers or
 * extensions block.
 */
export async function fetchLrclibLyrics(
  song: { artist?: string; title: string; duration?: number },
  signal?: AbortSignal,
): Promise<StructuredLyrics | null> {
  if (!song.artist) return null;
  const query = { artist_name: song.artist, track_name: song.title };
  const records: LrclibRecord[] = [];
  try {
    const qs = new URLSearchParams({ ...query, ...(song.duration ? { duration: String(Math.round(song.duration)) } : {}) });
    const res = await fetch(`${LRCLIB_URL}/get?${qs}`, { signal });
    if (res.ok) records.push((await res.json()) as LrclibRecord);
    const best = pickLrclib(records, song.duration);
    if (best?.synced) return best;
    const found = await fetch(`${LRCLIB_URL}/search?${new URLSearchParams(query)}`, { signal });
    if (found.ok) records.push(...((await found.json()) as LrclibRecord[]));
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    // LRCLIB unreachable: keep what was found so far.
  }
  return pickLrclib(records, song.duration);
}
