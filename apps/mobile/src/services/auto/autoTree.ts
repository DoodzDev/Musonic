/**
 * @file autoTree.ts
 * @description Android Auto browse tree (ADR-015), pure part: node ids and the
 *   items sent to the car. A track id carries the list it belongs to
 *   (`playlist:42|1337`) so a tap plays the whole list from that track.
 *   Covers are given as `{key, uri}`: native turns them into a content URI,
 *   the real address (it may hold credentials) never leaves the app.
 * @author DoodzProg
 * @version 1.2.0
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
};

/** Builds the cover of an item from its Subsonic cover id (undefined when there is none). */
export type ArtOf = (coverArt?: string) => AutoArt | undefined;

export const ROOT = 'root';
export const LIBRARY = 'library';
export const PLAYLISTS = 'playlists';
export const ALBUMS = 'albums';
export const ARTISTS = 'artists';
export const DOWNLOADS = 'downloads';

/** A list whose tracks can be played from the car. */
export type AutoList = {kind: 'playlist'; id: string} | {kind: 'album'; id: string} | {kind: 'downloads'};

export type AutoNode =
  | {kind: 'root'}
  | {kind: 'library'}
  | {kind: 'playlists'}
  | {kind: 'albums'}
  | {kind: 'artists'}
  | {kind: 'artist'; id: string}
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

const PREFIXED = ['playlist', 'album', 'artist'] as const;

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
  if (id.includes('|')) return {kind: 'unknown'};
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
  if (list.kind !== 'playlist' && list.kind !== 'album' && list.kind !== 'downloads') return null;
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
  }, artOf(p.coverArt)));
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

function withArt(item: AutoItem, art: AutoArt | undefined): AutoItem {
  return art ? {...item, art} : item;
}
