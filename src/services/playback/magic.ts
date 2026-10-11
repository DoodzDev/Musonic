/**
 * @file magic.ts
 * @description Magic shuffle suggestions: top tracks of the queue's artists
 *   (online catalogue) mixed with the server's similar songs, random songs as
 *   a fallback. Pure fetching: the playback engine decides where they go.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {getRandomSongs, getSimilarSongs} from '../../api/endpoints/library';
import {getCoverArtUrl, getStreamUrl} from '../../api/client';
import {getDeezerArtistId, getDeezerArtistTopTracks, type DeezerTrack} from '../../api/deezer';
import type {Track} from '../../store/playerStore';
import {shuffle} from './buildQueue';

/** Artists of the first tracks used as seeds. */
const SEED_ARTISTS = 3;

function serverTrack(s: any): Track {
  const id = String(s.id);
  return {
    id,
    title: s.title,
    artist: s.artist ?? '',
    album: s.album ?? '',
    duration: s.duration ?? 0,
    coverArt: s.coverArt,
    streamUrl: getStreamUrl(id),
    url: getStreamUrl(id),
    artwork: getCoverArtUrl(s.coverArt ?? id, 300),
    artistId: s.artistId ? String(s.artistId) : undefined,
    isMagic: true,
  };
}

function catalogueTrack(t: DeezerTrack): Track {
  const id = `ext-deezer-song-${t.id}`;
  return {
    id,
    title: t.title,
    artist: t.artist.name,
    album: t.album.title,
    duration: t.duration,
    coverArt: id,
    streamUrl: getStreamUrl(id),
    url: getStreamUrl(id),
    artwork: getCoverArtUrl(id, 300),
    isMagic: true,
  };
}

/**
 * Returns up to `count` suggestions related to `seeds`, never one of them.
 * Errors are swallowed: no suggestion is better than a broken queue.
 */
export async function fetchMagicSuggestions(seeds: Track[], count: number): Promise<Track[]> {
  if (count <= 0) return [];
  const known = new Set(seeds.map(t => t.id));
  const artists = [...new Set(seeds.slice(0, 10).map(t => t.artist).filter(Boolean))].slice(0, SEED_ARTISTS);
  const firstServerTrack = seeds.find(t => !t.id.startsWith('ext-'));

  const [catalogue, similar] = await Promise.all([
    Promise.all(
      artists.map(async name => {
        const id = await getDeezerArtistId(name).catch(() => null);
        return id ? getDeezerArtistTopTracks(id, 10).catch(() => [] as DeezerTrack[]) : [];
      }),
    ),
    firstServerTrack ? getSimilarSongs(firstServerTrack.id, 10).catch(() => []) : Promise.resolve([]),
  ]);

  const unique = new Map<string, Track>();
  for (const t of catalogue.flat().map(catalogueTrack)) unique.set(t.id, t);
  for (const t of (similar as any[]).map(serverTrack)) unique.set(t.id, t);
  const pool = [...unique.values()].filter(t => !known.has(t.id));
  if (pool.length > 0) return shuffle(pool, Math.random).slice(0, count);

  const random = await getRandomSongs(count).catch(() => []);
  return (random as any[]).map(serverTrack).filter(t => !known.has(t.id));
}
