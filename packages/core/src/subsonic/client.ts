/**
 * @file client.ts
 * @description Minimal Subsonic API client (JSON format, token authentication).
 * @author DoodzProg
 * @version 0.3.0
 * @license CC-BY-NC-4.0
 */

import type {
  Album,
  AlbumListType,
  AlbumWithSongs,
  ArtistInfo,
  ArtistWithAlbums,
  Genre,
  Playlist,
  PlaylistWithSongs,
  Song,
  Starred,
  SubsonicErrorPayload,
  SubsonicSession,
} from './types.ts';

export const API_VERSION = '1.16.1';
export const CLIENT_NAME = 'Musonic';

/**
 * Error raised by the client. The message never contains the request URL:
 * it carries the authentication token.
 */
export class SubsonicError extends Error {
  readonly code?: number;
  readonly status?: number;
  private readonly unreachable: boolean;

  constructor(message: string, options: { code?: number; status?: number; unreachable?: boolean } = {}) {
    super(message);
    this.name = 'SubsonicError';
    this.code = options.code;
    this.status = options.status;
    this.unreachable = options.unreachable ?? false;
  }

  /** No answer from the server: network down, DNS failure, or a gateway that could not reach it. */
  get isUnreachable(): boolean {
    return this.unreachable || this.status === 502 || this.status === 503 || this.status === 504;
  }

  /** Wrong username or password (Subsonic codes 40/41, or HTTP 401 from a proxy). */
  get isAuthError(): boolean {
    return this.code === 40 || this.code === 41 || this.status === 401;
  }
}

type Params = Record<string, string | number | undefined>;
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class SubsonicClient {
  private readonly session: SubsonicSession;
  private readonly fetchImpl: FetchLike;

  constructor(session: SubsonicSession, fetchImpl: FetchLike = (input, init) => fetch(input, init)) {
    this.session = session;
    this.fetchImpl = fetchImpl;
  }

  /** Full endpoint URL with authentication parameters. Treat it as a secret: never log or persist it. */
  buildUrl(endpoint: string, params: Params = {}): string {
    const query = new URLSearchParams({
      u: this.session.username,
      t: this.session.token,
      s: this.session.salt,
      v: API_VERSION,
      c: CLIENT_NAME,
      f: 'json',
    });
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) query.set(key, String(value));
    }
    return `${this.session.baseUrl}/rest/${endpoint}.view?${query.toString()}`;
  }

  async request<T>(endpoint: string, params: Params = {}, signal?: AbortSignal): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.buildUrl(endpoint, params), { signal });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
      throw new SubsonicError('Server unreachable', { unreachable: true });
    }
    if (!response.ok) {
      throw new SubsonicError(`HTTP ${response.status}`, { status: response.status });
    }
    const body = (await response.json()) as { 'subsonic-response'?: Record<string, unknown> };
    const payload = body['subsonic-response'];
    if (!payload) throw new SubsonicError('Not a Subsonic response');
    if (payload.status !== 'ok') {
      const error = payload.error as SubsonicErrorPayload | undefined;
      throw new SubsonicError(error?.message ?? 'Request failed', { code: error?.code });
    }
    return payload as T;
  }

  async ping(signal?: AbortSignal): Promise<void> {
    await this.request('ping', {}, signal);
  }

  async getPlaylists(signal?: AbortSignal): Promise<Playlist[]> {
    const res = await this.request<{ playlists?: { playlist?: Playlist[] } }>('getPlaylists', {}, signal);
    return res.playlists?.playlist ?? [];
  }

  async getPlaylist(id: string, signal?: AbortSignal): Promise<PlaylistWithSongs> {
    const res = await this.request<{ playlist: PlaylistWithSongs }>('getPlaylist', { id }, signal);
    return { ...res.playlist, entry: res.playlist.entry ?? [] };
  }

  async getAlbumList(
    type: AlbumListType,
    options: { size?: number; offset?: number; genre?: string } = {},
    signal?: AbortSignal,
  ): Promise<Album[]> {
    const res = await this.request<{ albumList2?: { album?: Album[] } }>('getAlbumList2', { type, ...options }, signal);
    return res.albumList2?.album ?? [];
  }

  async getAlbum(id: string, signal?: AbortSignal): Promise<AlbumWithSongs> {
    const res = await this.request<{ album: AlbumWithSongs }>('getAlbum', { id }, signal);
    return { ...res.album, song: res.album.song ?? [] };
  }

  async getArtist(id: string, signal?: AbortSignal): Promise<ArtistWithAlbums> {
    const res = await this.request<{ artist: ArtistWithAlbums }>('getArtist', { id }, signal);
    return { ...res.artist, album: res.artist.album ?? [] };
  }

  async getArtistInfo(id: string, count = 10, signal?: AbortSignal): Promise<ArtistInfo> {
    const res = await this.request<{ artistInfo2?: { biography?: string; similarArtist?: ArtistInfo['similarArtist'] } }>(
      'getArtistInfo2',
      { id, count },
      signal,
    );
    return { biography: res.artistInfo2?.biography, similarArtist: res.artistInfo2?.similarArtist ?? [] };
  }

  async getTopSongs(artist: string, count = 10, signal?: AbortSignal): Promise<Song[]> {
    const res = await this.request<{ topSongs?: { song?: Song[] } }>('getTopSongs', { artist, count }, signal);
    return res.topSongs?.song ?? [];
  }

  async getStarred(signal?: AbortSignal): Promise<Starred> {
    const res = await this.request<{ starred2?: Partial<Starred> }>('getStarred2', {}, signal);
    return { song: res.starred2?.song ?? [], album: res.starred2?.album ?? [], artist: res.starred2?.artist ?? [] };
  }

  async getSimilarSongs(id: string, count = 20, signal?: AbortSignal): Promise<Song[]> {
    const res = await this.request<{ similarSongs2?: { song?: Song[] } }>('getSimilarSongs2', { id, count }, signal);
    return res.similarSongs2?.song ?? [];
  }

  async getRandomSongs(options: { size?: number; genre?: string } = {}, signal?: AbortSignal): Promise<Song[]> {
    const res = await this.request<{ randomSongs?: { song?: Song[] } }>('getRandomSongs', options, signal);
    return res.randomSongs?.song ?? [];
  }

  async getGenres(signal?: AbortSignal): Promise<Genre[]> {
    const res = await this.request<{ genres?: { genre?: Genre[] } }>('getGenres', {}, signal);
    return res.genres?.genre ?? [];
  }

  /** Audio URL for an `<audio>` element. Contains the token: keep it in memory only. */
  streamUrl(id: string): string {
    return this.buildUrl('stream', { id });
  }

  /** Cover image URL. Contains the token: keep it in memory only. */
  coverArtUrl(id: string, size?: number): string {
    return this.buildUrl('getCoverArt', { id, size });
  }
}
