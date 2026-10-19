/**
 * @file home.ts
 * @description Personalized home feed: shelves built from the user's own library and history.
 *   `loadHome` only needs the few server calls of `HomeSource`, so any client
 *   can feed it (the web's `SubsonicClient`, the mobile app's own API layer).
 * @author DoodzProg
 * @version 0.3.0
 * @license CC-BY-NC-4.0
 */

import type { Album, AlbumListType, Artist, ArtistInfo, ArtistWithAlbums, Playlist, Song, Starred } from '../subsonic/types.ts';
import { dailySeed, pick, seededRng, shuffled, type Rng } from './random.ts';

export type CardItem =
  | { type: 'album'; album: Album }
  | { type: 'artist'; artist: Artist; fallbackCoverArt?: string }
  | { type: 'playlist'; playlist: Playlist }
  | { type: 'liked'; count: number }
  | { type: 'song'; song: Song }
  | { type: 'mix'; id: string; genre: string; songs: Song[]; covers: string[] };

/** Stable identifiers: the client maps them to translated titles. */
export type ShelfId =
  | 'recent'
  | 'favoriteArtists'
  | 'moreLike'
  | 'likedAlbums'
  | 'becauseLiked'
  | 'magicMixes'
  | 'rediscover'
  | 'newest'
  | 'random';

export type ShelfKind = 'albums' | 'artists' | 'songs' | 'mixes';

export interface Shelf {
  id: ShelfId;
  kind: ShelfKind;
  /** Name inserted in the title, e.g. the artist of "More like …". */
  context?: string;
  items: CardItem[];
}

export interface HomeFeed {
  quickAccess: CardItem[];
  shelves: Shelf[];
}

/** First wave of data, fetched in parallel. */
export interface HomeBase {
  recent: Album[];
  frequent: Album[];
  newest: Album[];
  random: Album[];
  starred: Starred;
  playlists: Playlist[];
}

/** Picks of the day, which decide the second wave of requests. */
export interface HomeSeeds {
  styleArtist?: { id: string; name: string };
  likedSong?: Song;
  genres: string[];
}

/** Second wave of data, depending on the seeds. */
export interface HomeExtra {
  similarArtistAlbums: Album[];
  similarSongs: Song[];
  genreMixes: { genre: string; songs: Song[] }[];
}

export interface ArtistScore {
  artist: Artist;
  score: number;
  fallbackCoverArt?: string;
}

/**
 * The server calls the home feed needs; `SubsonicClient` provides them all.
 * Spelled out (not picked from the client) so that this module never pulls
 * the client and its dependencies into an app that brings its own API layer.
 */
export interface HomeSource {
  getAlbumList(type: AlbumListType, options?: { size?: number; offset?: number; genre?: string }, signal?: AbortSignal): Promise<Album[]>;
  getStarred(signal?: AbortSignal): Promise<Starred>;
  getPlaylists(signal?: AbortSignal): Promise<Playlist[]>;
  getArtistInfo(id: string, count?: number, signal?: AbortSignal): Promise<ArtistInfo>;
  getArtist(id: string, signal?: AbortSignal): Promise<ArtistWithAlbums>;
  getSimilarSongs(id: string, count?: number, signal?: AbortSignal): Promise<Song[]>;
  getRandomSongs(options?: { size?: number; genre?: string }, signal?: AbortSignal): Promise<Song[]>;
}

const SHELF_SIZE = 12;
const QUICK_ACCESS_SIZE = 8;
const REDISCOVER_AFTER_DAYS = 60;
const DAY_MS = 86_400_000;

/** Up to four covers for a mix mosaic, one per album (each track of an album has its own cover id). */
export function mixCovers(songs: Song[]): string[] {
  const byAlbum = new Map<string, string>();
  for (const s of songs) {
    const key = s.albumId ?? s.album ?? s.coverArt;
    if (s.coverArt && key && !byAlbum.has(key)) byAlbum.set(key, s.coverArt);
    if (byAlbum.size === 4) break;
  }
  return [...byAlbum.values()];
}

/**
 * Artists credited on a song or album, one by one. The server joins several
 * artists in `artist` ("Lil Nas X • Billy Ray Cyrus") with the id of the
 * first one: use its `artists` list when it gives one, else the first name.
 */
function credited(item: Song | Album): { id: string; name: string }[] {
  const listed = (item.artists ?? []).filter((a) => a.id && a.name);
  if (listed.length > 0) return listed;
  const first = item.artist?.split('•')[0].trim();
  return item.artistId && first ? [{ id: item.artistId, name: first }] : [];
}

/** Ranks artists from play counts, liked songs and liked artists. */
export function favoriteArtists(base: HomeBase): ArtistScore[] {
  const scores = new Map<string, ArtistScore>();
  const add = (id: string | undefined, name: string | undefined, points: number, cover?: string) => {
    if (!id || !name) return;
    const entry = scores.get(id) ?? { artist: { id, name, coverArt: `ar-${id}` }, score: 0 };
    entry.score += points;
    entry.fallbackCoverArt ??= cover;
    scores.set(id, entry);
  };
  base.frequent.forEach((album, i) => {
    // Some servers omit playCount: fall back to the rank in the "frequent" list.
    for (const a of credited(album)) add(a.id, a.name, album.playCount ?? base.frequent.length - i, album.coverArt);
  });
  base.starred.song.forEach((song) => {
    for (const a of credited(song)) add(a.id, a.name, 1, song.coverArt);
  });
  base.starred.artist.forEach((artist) => {
    add(artist.id, artist.name, 5);
    const entry = scores.get(artist.id);
    if (entry && artist.coverArt) entry.artist.coverArt = artist.coverArt;
  });
  return [...scores.values()].sort((a, b) => b.score - a.score);
}

/** Most frequent genres among the albums the user plays or likes. */
export function topGenres(base: HomeBase, limit = 6): string[] {
  const counts = new Map<string, number>();
  for (const album of [...base.frequent, ...base.recent, ...base.starred.album]) {
    if (album.genre) counts.set(album.genre, (counts.get(album.genre) ?? 0) + 1);
  }
  for (const song of base.starred.song) {
    if (song.genre) counts.set(song.genre, (counts.get(song.genre) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([genre]) => genre);
}

/** `mixCount`: how many Magic Mixes to make (one per top genre). */
export function planSeeds(base: HomeBase, rng: Rng, mixCount = 4): HomeSeeds {
  const favorite = pick(favoriteArtists(base).slice(0, 5), rng);
  return {
    styleArtist: favorite ? { id: favorite.artist.id, name: favorite.artist.name } : undefined,
    likedSong: pick(base.starred.song, rng),
    genres: shuffled(topGenres(base, Math.max(6, mixCount + 2)), rng).slice(0, mixCount),
  };
}

function quickAccess(base: HomeBase): CardItem[] {
  const items: CardItem[] = [];
  if (base.starred.song.length > 0) items.push({ type: 'liked', count: base.starred.song.length });
  const playlists = base.playlists
    .slice()
    .sort((a, b) => (b.changed ?? '').localeCompare(a.changed ?? ''))
    .slice(0, 3);
  for (const playlist of playlists) items.push({ type: 'playlist', playlist });
  for (const album of base.recent) {
    if (items.length >= QUICK_ACCESS_SIZE) break;
    items.push({ type: 'album', album });
  }
  return items;
}

/** Albums holding liked songs, built from the song data (no extra request). */
function likedSongAlbums(base: HomeBase, exclude: Set<string>): Album[] {
  const groups = new Map<string, { album: Album; likes: number }>();
  for (const song of base.starred.song) {
    if (!song.albumId || exclude.has(song.albumId)) continue;
    const group = groups.get(song.albumId) ?? {
      album: { id: song.albumId, name: song.album ?? '', artist: song.artist, artistId: song.artistId, coverArt: song.coverArt },
      likes: 0,
    };
    group.likes += 1;
    groups.set(song.albumId, group);
  }
  return [...groups.values()].sort((a, b) => b.likes - a.likes).map((g) => g.album);
}

function rediscover(base: HomeBase, now: Date): Album[] {
  const limit = now.getTime() - REDISCOVER_AFTER_DAYS * DAY_MS;
  return base.frequent
    .filter((album) => album.played && Date.parse(album.played) < limit)
    .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0));
}

/** Takes up to SHELF_SIZE albums not shown yet and marks them as shown. */
function takeAlbums(albums: Album[], seen: Set<string>): CardItem[] {
  const out: CardItem[] = [];
  for (const album of albums) {
    if (out.length >= SHELF_SIZE) break;
    if (seen.has(album.id)) continue;
    seen.add(album.id);
    out.push({ type: 'album', album });
  }
  return out;
}

const WEIGHTS: Record<Exclude<ShelfId, 'recent' | 'favoriteArtists' | 'random'>, number> = {
  moreLike: 1,
  likedAlbums: 0.9,
  becauseLiked: 0.85,
  magicMixes: 0.8,
  rediscover: 0.7,
  newest: 0.6,
};

export function buildHome(base: HomeBase, seeds: HomeSeeds, extra: HomeExtra, rng: Rng, now: Date): HomeFeed {
  const seen = new Set<string>();
  const head: Shelf[] = [];

  const recent = takeAlbums(base.recent, seen);
  if (recent.length) head.push({ id: 'recent', kind: 'albums', items: recent });

  const artists = favoriteArtists(base).slice(0, SHELF_SIZE);
  if (artists.length) {
    head.push({
      id: 'favoriteArtists',
      kind: 'artists',
      items: artists.map(({ artist, fallbackCoverArt }) => ({ type: 'artist', artist, fallbackCoverArt })),
    });
  }

  // The rotating shelves are ordered by weight plus a daily random share.
  const rotating: { shelf: Shelf; score: number }[] = [];
  const addRotating = (shelf: Shelf, weight: number) => {
    if (shelf.items.length === 0) return;
    const thin = shelf.items.length < 4 ? 0.5 : 0;
    rotating.push({ shelf, score: weight + rng() * 0.35 - thin });
  };

  if (seeds.styleArtist) {
    const albums = extra.similarArtistAlbums.filter((a) => a.artistId !== seeds.styleArtist?.id);
    addRotating({ id: 'moreLike', kind: 'albums', context: seeds.styleArtist.name, items: takeAlbums(albums, seen) }, WEIGHTS.moreLike);
  }

  const starredAlbumIds = new Set(base.starred.album.map((a) => a.id));
  addRotating(
    { id: 'likedAlbums', kind: 'albums', items: takeAlbums(likedSongAlbums(base, starredAlbumIds), seen) },
    WEIGHTS.likedAlbums,
  );

  if (seeds.likedSong) {
    const songs = extra.similarSongs.filter((s) => s.id !== seeds.likedSong?.id).slice(0, SHELF_SIZE);
    addRotating(
      { id: 'becauseLiked', kind: 'songs', context: seeds.likedSong.title, items: songs.map((song) => ({ type: 'song', song })) },
      WEIGHTS.becauseLiked,
    );
  }

  const mixes: CardItem[] = extra.genreMixes
    .filter((m) => m.songs.length >= 5)
    .map((m) => ({
      type: 'mix',
      id: `mix-${m.genre}`,
      genre: m.genre,
      songs: m.songs,
      covers: mixCovers(m.songs),
    }));
  addRotating({ id: 'magicMixes', kind: 'mixes', items: mixes }, WEIGHTS.magicMixes);

  addRotating({ id: 'rediscover', kind: 'albums', items: takeAlbums(rediscover(base, now), seen) }, WEIGHTS.rediscover);
  addRotating({ id: 'newest', kind: 'albums', items: takeAlbums(base.newest, seen) }, WEIGHTS.newest);

  rotating.sort((a, b) => b.score - a.score);
  const shelves = [...head, ...rotating.map((r) => r.shelf)];

  // "Random" always closes the page.
  const random = takeAlbums(shuffled(base.random, rng), seen);
  if (random.length) shelves.push({ id: 'random', kind: 'albums', items: random });

  return { quickAccess: quickAccess(base), shelves };
}

const settled = async <T>(promise: Promise<T>, fallback: T): Promise<T> => {
  try {
    return await promise;
  } catch {
    return fallback;
  }
};

/** Fetches everything in two parallel waves and builds the feed. A failing source only hides its shelf. */
export async function loadHome(
  client: HomeSource,
  options: { username: string; now?: Date; signal?: AbortSignal; mixCount?: number },
): Promise<HomeFeed> {
  const now = options.now ?? new Date();
  const signal = options.signal;
  const rng = seededRng(dailySeed(options.username, now));

  const [recent, frequent, newest, random, starred, playlists] = await Promise.all([
    settled(client.getAlbumList('recent', { size: 24 }, signal), []),
    settled(client.getAlbumList('frequent', { size: 40 }, signal), []),
    settled(client.getAlbumList('newest', { size: 16 }, signal), []),
    settled(client.getAlbumList('random', { size: 16 }, signal), []),
    settled(client.getStarred(signal), { song: [], album: [], artist: [] }),
    settled(client.getPlaylists(signal), []),
  ]);
  const base: HomeBase = { recent, frequent, newest, random, starred, playlists };
  const seeds = planSeeds(base, rng, options.mixCount);

  const similarArtistAlbums = async (): Promise<Album[]> => {
    if (!seeds.styleArtist) return [];
    const info = await client.getArtistInfo(seeds.styleArtist.id, 8, signal);
    const similar = info.similarArtist.filter((a) => a.id).slice(0, 4);
    const artists = await Promise.all(similar.map((a) => settled(client.getArtist(a.id, signal), null)));
    // One album per similar artist, the most recent one, for variety.
    return artists
      .map((a) => a?.album.slice().sort((x, y) => (y.year ?? 0) - (x.year ?? 0))[0])
      .filter((a): a is Album => !!a);
  };

  const [moreLike, similarSongs, genreMixes] = await Promise.all([
    settled(similarArtistAlbums(), []),
    seeds.likedSong ? settled(client.getSimilarSongs(seeds.likedSong.id, 20, signal), []) : Promise.resolve([]),
    Promise.all(
      seeds.genres.map(async (genre) => ({ genre, songs: await settled(client.getRandomSongs({ genre, size: 30 }, signal), []) })),
    ),
  ]);

  return buildHome(base, seeds, { similarArtistAlbums: moreLike, similarSongs, genreMixes }, rng, now);
}
