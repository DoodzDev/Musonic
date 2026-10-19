/**
 * @file external.ts
 * @description Online tracks injected by a proxy such as OctoFiesta (ids
 *   `ext-…`). The server cannot like them or put them in a playlist: the track
 *   must first be imported into the library, then found again under its library
 *   id. Playing it (or a ranged read of its stream) starts the import; the
 *   library is then searched until the track shows up.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import type { SubsonicClient } from './client.ts';
import type { Song } from './types.ts';

export function isExternalId(id: string): boolean {
  return id.startsWith('ext-');
}

/** Lower case, no accents, no punctuation: tags and catalog spell titles slightly differently. */
function normalize(text: string | undefined): string {
  return (text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function mainArtist(song: Song): string {
  return normalize(song.artists?.[0]?.name ?? song.artist?.split(/,| • | & | feat\.? /i)[0]);
}

/** The library copy of an online track among search results: same title, artist and length (± 3 s). */
export function findLibraryMatch(song: Song, candidates: readonly Song[]): Song | null {
  const title = normalize(song.title);
  const artist = mainArtist(song);
  return (
    candidates.find(
      (c) =>
        !isExternalId(c.id) &&
        normalize(c.title) === title &&
        (!artist || normalize(c.artist).includes(artist)) &&
        (!song.duration || !c.duration || Math.abs(song.duration - c.duration) <= 3),
    ) ?? null
  );
}

export interface ResolveOptions {
  signal?: AbortSignal;
  /** Gives up after this long (the import waits for the download, then a library scan); 0 only looks the library up. */
  timeoutMs?: number;
  intervalMs?: number;
  /** Called once when the import takes longer than usual. */
  onSlow?: () => void;
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });
}

/**
 * Library id of a song: its own id when it is already in the library, else the
 * id of its imported copy. Null when the import did not finish in time.
 */
export async function resolveLibraryId(client: SubsonicClient, song: Song, options: ResolveOptions = {}): Promise<string | null> {
  if (!isExternalId(song.id)) return song.id;
  const { signal, timeoutMs = 90_000, intervalMs = 3_000, onSlow } = options;
  const lookup = async () => findLibraryMatch(song, (await client.search(song.title, { songs: 20, albums: 0, artists: 0 }, signal)).song)?.id ?? null;

  // Already imported (played earlier): no need to start anything.
  const known = await lookup().catch(() => null);
  if (known || timeoutMs <= 0) return known;

  // A ranged read of the stream makes the proxy download the track.
  fetch(client.streamUrl(song.id), { headers: { Range: 'bytes=0-8191' }, signal })
    .then((res) => res.arrayBuffer())
    .catch(() => undefined);

  const deadline = Date.now() + timeoutMs;
  let warned = false;
  while (Date.now() < deadline) {
    await wait(intervalMs, signal);
    if (!warned && Date.now() > deadline - timeoutMs / 2) {
      warned = true;
      onSlow?.();
    }
    const id = await lookup().catch(() => null);
    if (id) return id;
  }
  return null;
}
