/**
 * @file autoTree.ts
 * @description Android Auto browse tree (ADR-015), pure part: node ids and the
 *   items sent to the car. A track id carries the list it belongs to
 *   (`playlist:42|1337`) so a tap plays the whole list from that track.
 *   Covers are given as `{key, uri}`: native turns them into a content URI,
 *   the real address (it may hold credentials) never leaves the app. A key
 *   `res:<name>` is drawn by the app itself (the Liked songs tile). Playlists
 *   and albums carry the car's Play and Shuffle buttons (browse actions).
 * @author DoodzProg
 * @version 1.4.0
 * @license CC-BY-NC-4.0
 */

/** Where a cover comes from: `key` names it, `uri` is a local file or the server URL. */
export type AutoArt = {key: string; uri: string};

/** One row in the car. `grid`: this node's own children show as a grid. */
export type AutoItem = {
  id: string;
  title: string;
  subtitle?: string;
  browsable?: boolean;
  downloaded?: boolean;
  grid?: boolean;
  art?: AutoArt;
  /** Buttons shown on the item in the car (`play`, `shuffle`), started without opening it. */
  actions?: AutoAction[];
};

export type AutoAction = 'play' | 'shuffle';
export const LIST_ACTIONS: AutoAction[] = ['play', 'shuffle'];

/** Builds the cover of an item from its Subsonic cover id (undefined when there is none). */
export type ArtOf = (coverArt?: string) => AutoArt | undefined;

export const ROOT = 'root';
export const LIBRARY = 'library';
export const PLAYLISTS = 'playlists';
export const ALBUMS = 'albums';
export const ARTISTS = 'artists';
export const DOWNLOADS = 'downloads';
export const LIKED = 'liked';
/** Home of the car (ADR-025 step 3): what is playing, to resume it in one tap. */
export const RESUME = 'resume';
/** Home of the car: lists played lately (the app's Recently played). */
export const RECENT = 'recent';
/** Playback screen of the car: what comes next (ADR-025 step 7). */
export const QUEUE = 'queue';
/** Drawn by the app: the Liked songs tile. */
export const LIKED_ART: AutoArt = {key: 'res:liked', uri: ''};

/** A list whose tracks can be played from the car. */
export type AutoList =
  | {kind: 'playlist'; id: string}
  | {kind: 'album'; id: string}
  | {kind: 'downloads'}
  | {kind: 'liked'}
  | {kind: 'search'; query: string};

export type AutoNode =
  | {kind: 'root'}
  | {kind: 'library'}
  | {kind: 'playlists'}
  | {kind: 'albums'}
  | {kind: 'artists'}
  | {kind: 'artist'; id: string}
  | {kind: 'resume'}
  | {kind: 'recent'}
  | {kind: 'queue'}
  | {kind: 'lyrics'; id: string}
  | AutoList
  | {kind: 'unknown'};

export type AutoTrackRef = {list: AutoList; trackId: string};

export function playlistNodeId(id: string): string {
  return `playlist:${id}`;
}

export function albumNodeId(id: string): string {
  return `album:${id}`;
}

export function artistNodeId(id: string): string {
  return `artist:${id}`;
}

/** Results of a search in the car (ADR-025 step 8); the words are encoded (no `|` left). */
export function searchNodeId(query: string): string {
  return `search:${encodeURIComponent(query)}`;
}

const PREFIXED = ['playlist', 'album', 'artist', 'lyrics'] as const;

export function trackMediaId(listNodeId: string, trackId: string): string {
  return `${listNodeId}|${trackId}`;
}

export function parseNode(id: string): AutoNode {
  if (id === ROOT) return {kind: 'root'};
  if (id === LIBRARY) return {kind: 'library'};
  if (id === PLAYLISTS) return {kind: 'playlists'};
  if (id === ALBUMS) return {kind: 'albums'};
  if (id === ARTISTS) return {kind: 'artists'};
  if (id === DOWNLOADS) return {kind: 'downloads'};
  if (id === LIKED) return {kind: 'liked'};
  if (id === RESUME) return {kind: 'resume'};
  if (id === RECENT) return {kind: 'recent'};
  if (id === QUEUE) return {kind: 'queue'};
  if (id.includes('|')) return {kind: 'unknown'};
  if (id.startsWith('search:') && id.length > 'search:'.length) {
    try {
      return {kind: 'search', query: decodeURIComponent(id.slice('search:'.length))};
    } catch {
      return {kind: 'unknown'};
    }
  }
  for (const kind of PREFIXED) {
    const prefix = `${kind}:`;
    if (id.startsWith(prefix) && id.length > prefix.length) return {kind, id: id.slice(prefix.length)};
  }
  return {kind: 'unknown'};
}

/** The list and track behind a playable id, or null for anything else. */
export function parseTrackRef(mediaId: string): AutoTrackRef | null {
  const sep = mediaId.lastIndexOf('|');
  if (sep <= 0 || sep === mediaId.length - 1) return null;
  const list = parseNode(mediaId.slice(0, sep));
  if (list.kind !== 'playlist' && list.kind !== 'album' && list.kind !== 'downloads' && list.kind !== 'liked' && list.kind !== 'search') {
    return null;
  }
  return {list, trackId: mediaId.slice(sep + 1)};
}

type PlaylistLike = {id: string; name: string; songCount?: number; coverArt?: string};
type AlbumLike = {id: string; name: string; artist?: string; coverArt?: string};
type ArtistLike = {id: string; name: string; coverArt?: string};
type SongRow = {id: string; title: string; artist?: string; coverArt?: string};

export function playlistItems(
  playlists: PlaylistLike[],
  subtitle: (songCount: number) => string,
  isDownloaded: (playlistId: string) => boolean,
  artOf: ArtOf,
): AutoItem[] {
  return playlists.map(p => withArt({
    id: playlistNodeId(String(p.id)),
    title: p.name,
    subtitle: subtitle(p.songCount ?? 0),
    browsable: true,
    downloaded: isDownloaded(String(p.id)),
    actions: LIST_ACTIONS,
  }, artOf(p.coverArt)));
}

/** The Liked songs list, first among the playlists as in the app. */
export function likedItem(title: string, subtitle: string, downloaded: boolean): AutoItem {
  return {id: LIKED, title, subtitle, browsable: true, downloaded, actions: LIST_ACTIONS, art: LIKED_ART};
}

export function trackItems(
  listNodeId: string,
  songs: SongRow[],
  isDownloaded: (trackId: string) => boolean,
  artOf: ArtOf,
): AutoItem[] {
  return songs.map(s => withArt({
    id: trackMediaId(listNodeId, String(s.id)),
    title: s.title,
    subtitle: s.artist,
    downloaded: isDownloaded(String(s.id)),
  }, artOf(s.coverArt || String(s.id))));
}

export function albumItems(albums: AlbumLike[], artOf: ArtOf): AutoItem[] {
  return albums.map(a => withArt({
    id: albumNodeId(String(a.id)),
    title: a.name,
    subtitle: a.artist,
    browsable: true,
    actions: LIST_ACTIONS,
  }, artOf(a.coverArt || String(a.id))));
}

/** An artist opens the grid of their albums. */
export function artistItems(artists: ArtistLike[], artOf: ArtOf): AutoItem[] {
  return artists.map(a => withArt({
    id: artistNodeId(String(a.id)),
    title: a.name,
    browsable: true,
    grid: true,
  }, artOf(a.coverArt || String(a.id))));
}

type QueuedTrack = {id: string; title: string; artist?: string; coverArt?: string};

/** Lyrics of a track for the car (ADR-025 step 6), asked by its id. */
export function lyricsNodeId(trackId: string): string {
  return `lyrics:${trackId}`;
}

/**
 * One row per line. A synced line's id carries its start (`line:<ms>`), so the car follows
 * the music; a plain line only its rank (`text:<n>`).
 */
export function lyricsItems(lyrics: {synced: boolean; lines: {start?: number; value: string}[]} | null): AutoItem[] {
  if (!lyrics) return [];
  return lyrics.lines.map((l, i) => ({
    id: lyrics.synced && l.start != null ? `line:${Math.round(l.start)}` : `text:${i}`,
    title: l.value,
  }));
}

/** The track to resume, tapped as one row (nothing when the queue is empty). */
export function resumeItems(current: QueuedTrack | undefined, from: string | undefined, artOf: ArtOf): AutoItem[] {
  if (!current) return [];
  const subtitle = [current.artist, from].filter(Boolean).join(' · ');
  return [withArt({id: RESUME, title: current.title, subtitle}, artOf(current.coverArt || String(current.id)))];
}

type RecentLike = {kind: string; id: string; name: string; artist?: string; coverArt?: string};

/**
 * Lists played lately, as the app's Recently played: albums, playlists, artists and Liked songs.
 * Songs and Magic Mixes stay out (no list to open in the car). Offline, only what can play.
 */
export function recentItems(
  plays: RecentLike[],
  liked: {title: string; subtitle: string},
  offline: boolean,
  artOf: ArtOf,
): AutoItem[] {
  const items: AutoItem[] = [];
  for (const p of plays) {
    if (p.kind === 'liked') items.push(likedItem(liked.title, liked.subtitle, false));
    else if (p.kind === 'playlist') {
      items.push(withArt({id: playlistNodeId(p.id), title: p.name, browsable: true, actions: LIST_ACTIONS}, artOf(p.coverArt)));
    } else if (offline) continue;
    else if (p.kind === 'album') {
      items.push(withArt({id: albumNodeId(p.id), title: p.name, subtitle: p.artist, browsable: true, actions: LIST_ACTIONS}, artOf(p.coverArt || p.id)));
    } else if (p.kind === 'artist') {
      items.push(withArt({id: artistNodeId(p.id), title: p.name, browsable: true, grid: true}, artOf(p.coverArt || p.id)));
    }
  }
  return items;
}

function withArt(item: AutoItem, art: AutoArt | undefined): AutoItem {
  return art ? {...item, art} : item;
}
