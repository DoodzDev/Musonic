/**
 * @file types.ts
 * @description Subsonic / OpenSubsonic response types used by Musonic clients.
 * @author DoodzProg
 * @version 0.4.0
 * @license CC-BY-NC-4.0
 */

/**
 * Credentials kept by a client once logged in. The clear password is never stored:
 * a device key on Musonic Server (ADR-021), the Subsonic token elsewhere.
 */
export interface SubsonicSession {
  /** Server origin, e.g. `https://music.example.com`. Empty string means same origin. */
  baseUrl: string;
  username: string;
  /** md5(password + salt), see the Subsonic token authentication. Empty with a device key. */
  token: string;
  salt: string;
  /** Musonic Server device key (OpenSubsonic `apiKey`), sent alone instead of `u` + `t` + `s`. */
  apiKey?: string;
  /** Id of the device key, to revoke it at logout. */
  apiKeyId?: string;
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
  /** A podcast episode played as a song: where to resume, in ms (ADR-023). */
  position?: number;
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

/** A show found in the podcast directory (Musonic Server `searchPodcasts`, ADR-023). */
export interface PodcastFound {
  id: string;
  feedUrl: string;
  title: string;
  author?: string;
  /** The directory's picture (the show is not on the server yet). */
  imageUrl?: string;
  genre?: string;
  episodeCount?: number;
  /** This account follows it. */
  followed: boolean;
}

/** A podcast episode (Subsonic `PodcastEpisode`, plus Musonic's `position` and `played`). */
export interface PodcastEpisode {
  id: string;
  channelId: string;
  title: string;
  description?: string;
  /** ISO date. */
  publishDate?: string;
  /** Seconds. */
  duration?: number;
  coverArt?: string;
  /** Where this account stopped, in ms (Musonic Server). */
  position?: number;
  /** Listened to the end (Musonic Server). */
  played?: boolean;
}

/** A podcast show (Subsonic `PodcastChannel`). */
export interface PodcastChannel {
  id: string;
  url: string;
  title: string;
  author?: string;
  description?: string;
  coverArt?: string;
  /** Musonic Server: this account follows it. */
  followed?: boolean;
  episode: PodcastEpisode[];
}

