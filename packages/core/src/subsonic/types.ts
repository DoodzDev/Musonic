/**
 * @file types.ts
 * @description Subsonic / OpenSubsonic response types used by Musonic clients.
 * @author DoodzProg
 * @version 0.2.0
 * @license CC-BY-NC-4.0
 */

/** Credentials kept by a client once logged in. The clear password is never stored. */
export interface SubsonicSession {
  /** Server origin, e.g. `https://music.example.com`. Empty string means same origin. */
  baseUrl: string;
  username: string;
  /** md5(password + salt), see the Subsonic token authentication. */
  token: string;
  salt: string;
}

export interface Playlist {
  id: string;
  name: string;
  songCount: number;
  /** Total duration in seconds. */
  duration: number;
  owner?: string;
  comment?: string;
  coverArt?: string;
  /** ISO date of the last change. */
  changed?: string;
}

export interface Song {
  id: string;
  title: string;
  artist?: string;
  artistId?: string;
  album?: string;
  albumId?: string;
  /** Duration in seconds. */
  duration?: number;
  coverArt?: string;
  track?: number;
  discNumber?: number;
  year?: number;
  genre?: string;
  playCount?: number;
  starred?: string;
  /** Each credited artist (OpenSubsonic); `artist` joins their names with " • ". */
  artists?: ArtistRef[];
}

/** One credited artist of a song or album (OpenSubsonic `artists`). */
export interface ArtistRef {
  id: string;
  name: string;
}

export interface Album {
  id: string;
  name: string;
  artist?: string;
  artistId?: string;
  coverArt?: string;
  songCount?: number;
  duration?: number;
  year?: number;
  genre?: string;
  playCount?: number;
  /** ISO date of the last play (Navidrome). */
  played?: string;
  starred?: string;
  created?: string;
  /** Each credited artist (OpenSubsonic); `artist` joins their names with " • ". */
  artists?: ArtistRef[];
}

export interface Artist {
  id: string;
  name: string;
  coverArt?: string;
  albumCount?: number;
  artistImageUrl?: string;
  starred?: string;
}

export interface PlaylistWithSongs extends Playlist {
  entry: Song[];
}

export interface AlbumWithSongs extends Album {
  song: Song[];
}

export interface ArtistWithAlbums extends Artist {
  album: Album[];
}

export interface ArtistInfo {
  biography?: string;
  similarArtist: Artist[];
}

export interface Starred {
  song: Song[];
  album: Album[];
  artist: Artist[];
}

export interface SearchResult {
  song: Song[];
  album: Album[];
  artist: Artist[];
}

/** OpenSubsonic lyrics: synced lines carry their start in milliseconds. */
export interface StructuredLyrics {
  synced: boolean;
  line: { start?: number; value: string }[];
}

export interface Genre {
  value: string;
  songCount?: number;
  albumCount?: number;
}

export type AlbumListType =
  | 'random'
  | 'newest'
  | 'highest'
  | 'frequent'
  | 'recent'
  | 'alphabeticalByName'
  | 'alphabeticalByArtist'
  | 'starred'
  | 'byGenre'
  | 'byYear';

/** Error payload of a `failed` Subsonic response. */
export interface SubsonicErrorPayload {
  code: number;
  message?: string;
}
