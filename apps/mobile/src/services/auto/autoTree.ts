/**
 * @file autoTree.ts
 * @description Android Auto browse tree (ADR-015), pure part: node ids and the
 *   items sent to the car. A track id carries the list it belongs to
 *   (`playlist:42|1337`) so a tap plays the whole list from that track.
 *   Covers are given as `{key, uri}`: native turns them into a content URI,
 *   the real address (it may hold credentials) never leaves the app.
 * @author DoodzProg
 * @version 1.1.0
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

export type AutoNode =
  | {kind: 'root'}
  | {kind: 'library'}
  | {kind: 'playlists'}
  | {kind: 'playlist'; id: string}
  | {kind: 'unknown'};

export type AutoTrackRef = {list: {kind: 'playlist'; id: string}; trackId: string};

export function playlistNodeId(id: string): string {
  return `playlist:${id}`;
}

export function trackMediaId(listNodeId: string, trackId: string): string {
  return `${listNodeId}|${trackId}`;
}

export function parseNode(id: string): AutoNode {
  if (id === ROOT) return {kind: 'root'};
  if (id === LIBRARY) return {kind: 'library'};
  if (id === PLAYLISTS) return {kind: 'playlists'};
  if (id.startsWith('playlist:') && id.length > 'playlist:'.length && !id.includes('|')) {
    return {kind: 'playlist', id: id.slice('playlist:'.length)};
  }
  return {kind: 'unknown'};
}

/** The list and track behind a playable id, or null for anything else. */
export function parseTrackRef(mediaId: string): AutoTrackRef | null {
  const sep = mediaId.lastIndexOf('|');
  if (sep <= 0 || sep === mediaId.length - 1) return null;
  const list = parseNode(mediaId.slice(0, sep));
  if (list.kind !== 'playlist') return null;
  return {list, trackId: mediaId.slice(sep + 1)};
}

type PlaylistLike = {id: string; name: string; songCount?: number; coverArt?: string};
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

function withArt(item: AutoItem, art: AutoArt | undefined): AutoItem {
  return art ? {...item, art} : item;
}
