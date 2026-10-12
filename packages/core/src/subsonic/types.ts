/**
 * @file types.ts
 * @description Subsonic / OpenSubsonic response types used by Musonic clients.
 * @author DoodzProg
 * @version 0.1.0
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
}

export interface Song {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  /** Duration in seconds. */
  duration?: number;
  coverArt?: string;
}

export interface PlaylistWithSongs extends Playlist {
  entry: Song[];
}

/** Error payload of a `failed` Subsonic response. */
export interface SubsonicErrorPayload {
  code: number;
  message?: string;
}
