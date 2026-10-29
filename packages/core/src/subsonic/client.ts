/**
 * @file client.ts
 * @description Minimal Subsonic API client (JSON format, device key or token
 *   authentication). An account the server refuses (key revoked, suspended,
 *   password changed) is reported through `onAuthProblem`.
 * @author DoodzProg
 * @version 0.9.0
 * @license CC-BY-NC-4.0
 */

import type {
  Album,
  AlbumListType,
  Artist,
  AlbumWithSongs,
  ArtistInfo,
  ArtistWithAlbums,
  Genre,
  Playlist,
  PlaylistWithSongs,
  PodcastChannel,
  PodcastEpisode,
  PodcastFound,
  Song,
  SearchResult,
  Starred,
  StructuredLyrics,
  SubsonicErrorPayload,
  SubsonicSession,
} from './types.ts';
import type { HomeBase, HomeExtra, HomeSeeds } from '../home/home.ts';

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

  /** Why the server refused the account itself, or `null` when the error is about something else. */
  get authProblem(): AuthProblemReason | null {
    if (this.code === 44) return 'revoked';
    if (this.code === 40) return 'credentials';
    // 50 is also "not allowed" for one action (someone else's playlist): only the suspension counts.
    if (this.code === 50 && /suspended/i.test(this.message)) return 'suspended';
    return null;
  }
}

/** Why an account has to sign in again: device key revoked, account suspended, password changed. */
export type AuthProblemReason = 'revoked' | 'suspended' | 'credentials';

export interface SubsonicClientOptions {
  /** Called when the server refuses the account (the request still fails). */
  onAuthProblem?: (reason: AuthProblemReason) => void;
}

/** A list value is sent as a repeated parameter (`songIdToAdd=1&songIdToAdd=2`). */
type Params = Record<string, string | number | boolean | undefined | readonly (string | number)[]>;
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class SubsonicClient {
  private readonly session: SubsonicSession;
  private readonly fetchImpl: FetchLike;
  private readonly options: SubsonicClientOptions;

  constructor(
    session: SubsonicSession,
    fetchImpl: FetchLike = (input, init) => fetch(input, init),
    options: SubsonicClientOptions = {},
  ) {
    this.session = session;
    this.fetchImpl = fetchImpl;
    this.options = options;
  }

  /** Full endpoint URL with authentication parameters. Treat it as a secret: never log or persist it. */
  buildUrl(endpoint: string, params: Params = {}): string {
    // OpenSubsonic: the key is sent alone (`u` beside it is refused).
    const auth: Record<string, string> = this.session.apiKey
      ? { apiKey: this.session.apiKey }
      : { u: this.session.username, t: this.session.token, s: this.session.salt };
    const query = new URLSearchParams({
      ...auth,
      v: API_VERSION,
      c: CLIENT_NAME,
      f: 'json',
    });
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) for (const item of value) query.append(key, String(item));
      else if (value !== undefined) query.set(key, String(value));
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
      const failure = new SubsonicError(error?.message ?? 'Request failed', { code: error?.code });
      const problem = failure.authProblem;
      if (problem) this.options.onAuthProblem?.(problem);
      throw failure;
    }
    return payload as T;
  }

  /** Checks the credentials; `musonic` tells a Musonic Server apart (it marks every answer). */
  async ping(signal?: AbortSignal): Promise<{ musonic: boolean }> {
    const res = await this.request<{ type?: string }>('ping', {}, signal);
    return { musonic: res.type === 'musonic' };
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
    /** `fromYear` / `toYear` are required by `byYear`. */
    options: { size?: number; offset?: number; genre?: string; fromYear?: number; toYear?: number } = {},
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

  /**
   * First wave of the home screen in one request (Musonic Server, ADR-021): the four album lists,
   * likes and playlists. Fails on another server: callers fall back to the separate requests.
   */
  async getMusonicHome(signal?: AbortSignal): Promise<HomeBase> {
    const res = await this.request<{ musonicHome?: Partial<HomeBase> & { starred?: Partial<Starred> } }>('getMusonicHome', {}, signal);
    const home = res.musonicHome;
    if (!home) throw new SubsonicError('Not a Musonic Server');
    return {
      recent: home.recent ?? [],
      frequent: home.frequent ?? [],
      newest: home.newest ?? [],
      random: home.random ?? [],
      starred: { song: home.starred?.song ?? [], album: home.starred?.album ?? [], artist: home.starred?.artist ?? [] },
      playlists: home.playlists ?? [],
    };
  }

  /** Second wave of the home screen in one request, chained by the server (Musonic Server, ADR-021). */
  async getMusonicHomeMore(seeds: HomeSeeds, signal?: AbortSignal): Promise<HomeExtra> {
    const res = await this.request<{
      musonicHomeMore?: { similarArtistAlbums?: Album[]; similarSongs?: Song[]; genreMixes?: { genre: string; song?: Song[] }[] };
    }>('getMusonicHomeMore', { artist: seeds.styleArtist?.id, song: seeds.likedSong?.id, genre: seeds.genres }, signal);
    const more = res.musonicHomeMore;
    if (!more) throw new SubsonicError('Not a Musonic Server');
    return {
      similarArtistAlbums: more.similarArtistAlbums ?? [],
      similarSongs: more.similarSongs ?? [],
      genreMixes: (more.genreMixes ?? []).map((m) => ({ genre: m.genre, songs: m.song ?? [] })),
    };
  }

  async getRandomSongs(options: { size?: number; genre?: string } = {}, signal?: AbortSignal): Promise<Song[]> {
    const res = await this.request<{ randomSongs?: { song?: Song[] } }>('getRandomSongs', options, signal);
    return res.randomSongs?.song ?? [];
  }

  async getGenres(signal?: AbortSignal): Promise<Genre[]> {
    const res = await this.request<{ genres?: { genre?: Genre[] } }>('getGenres', {}, signal);
    return res.genres?.genre ?? [];
  }

  /** `offsets` page through the results (an empty query lists the whole library on most servers). */
  async search(
    query: string,
    counts: { songs?: number; albums?: number; artists?: number } = {},
    signal?: AbortSignal,
    offsets: { songs?: number; albums?: number; artists?: number } = {},
  ): Promise<SearchResult> {
    const res = await this.request<{ searchResult3?: Partial<SearchResult> }>(
      'search3',
      {
        query,
        songCount: counts.songs ?? 20,
        albumCount: counts.albums ?? 20,
        artistCount: counts.artists ?? 20,
        songOffset: offsets.songs,
        albumOffset: offsets.albums,
        artistOffset: offsets.artists,
      },
      signal,
    );
    const r = res.searchResult3 ?? {};
    return { song: r.song ?? [], album: r.album ?? [], artist: r.artist ?? [] };
  }

  async getSongsByGenre(genre: string, count = 200, offset = 0, signal?: AbortSignal): Promise<Song[]> {
    const res = await this.request<{ songsByGenre?: { song?: Song[] } }>('getSongsByGenre', { genre, count, offset }, signal);
    return res.songsByGenre?.song ?? [];
  }

  async getArtists(signal?: AbortSignal): Promise<Artist[]> {
    const res = await this.request<{ artists?: { index?: { artist?: Artist[] }[] } }>('getArtists', {}, signal);
    return (res.artists?.index ?? []).flatMap((i) => i.artist ?? []);
  }

  async createPlaylist(name: string, songIds: readonly string[] = [], signal?: AbortSignal): Promise<PlaylistWithSongs> {
    const res = await this.request<{ playlist?: PlaylistWithSongs }>('createPlaylist', { name, songId: songIds }, signal);
    if (!res.playlist) throw new SubsonicError('Playlist not returned');
    return { ...res.playlist, entry: res.playlist.entry ?? [] };
  }

  /** Renames, edits the comment, adds songs at the end and removes songs by position. */
  async updatePlaylist(
    id: string,
    changes: { name?: string; comment?: string; add?: readonly string[]; removeIndexes?: readonly number[] },
    signal?: AbortSignal,
  ): Promise<void> {
    await this.request(
      'updatePlaylist',
      { playlistId: id, name: changes.name, comment: changes.comment, songIdToAdd: changes.add, songIndexToRemove: changes.removeIndexes },
      signal,
    );
  }

  /** Replaces all the songs of a playlist, in this order (how Subsonic clients reorder and remove). */
  async replacePlaylistSongs(id: string, songIds: readonly string[], signal?: AbortSignal): Promise<void> {
    await this.request('createPlaylist', { playlistId: id, songId: songIds }, signal);
  }

  async deletePlaylist(id: string, signal?: AbortSignal): Promise<void> {
    await this.request('deletePlaylist', { id }, signal);
  }

  async star(ids: { songs?: readonly string[]; albums?: readonly string[]; artists?: readonly string[] }, signal?: AbortSignal): Promise<void> {
    await this.request('star', { id: ids.songs, albumId: ids.albums, artistId: ids.artists }, signal);
  }

  async unstar(ids: { songs?: readonly string[]; albums?: readonly string[]; artists?: readonly string[] }, signal?: AbortSignal): Promise<void> {
    await this.request('unstar', { id: ids.songs, albumId: ids.albums, artistId: ids.artists }, signal);
  }

  /**
   * Reports a play (`submission`, with its date in ms) or what is playing now
   * (`submission: false`, shown by `getNowPlaying`).
   */
  async scrobble(id: string, options: { submission: boolean; time?: number }, signal?: AbortSignal): Promise<void> {
    await this.request('scrobble', { id, submission: options.submission, time: options.time }, signal);
  }

  /** Synced lyrics when the server has them (OpenSubsonic), else the plain text. */
  async getLyrics(song: { id: string; artist?: string; title: string }, signal?: AbortSignal): Promise<StructuredLyrics | null> {
    try {
      const res = await this.request<{ lyricsList?: { structuredLyrics?: StructuredLyrics[] } }>('getLyricsBySongId', { id: song.id }, signal);
      const list = res.lyricsList?.structuredLyrics ?? [];
      const best = list.find((l) => l.synced) ?? list[0];
      if (best && best.line.length) return best;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      // Not an OpenSubsonic server: fall back to the classic endpoint.
    }
    // A podcast episode has its transcript or nothing: no song lyrics under its show's name.
    if (song.id.startsWith('pe-')) return null;
    const res = await this.request<{ lyrics?: { value?: string } }>('getLyrics', { artist: song.artist, title: song.title }, signal);
    const text = res.lyrics?.value?.trim();
    return text ? { synced: false, line: text.split(/\r?\n/).map((value) => ({ value })) } : null;
  }

  /** Audio URL for an `<audio>` element. Contains the token: keep it in memory only. */
  /** Musonic Server: shows in the podcast directory. `country`: the store to search (`fr`…). */
  async searchPodcasts(query: string, country?: string, signal?: AbortSignal): Promise<PodcastFound[]> {
    const res = await this.request<{ searchPodcasts?: { podcast?: PodcastFound[] } }>('searchPodcasts', { query, country }, signal);
    return res.searchPodcasts?.podcast ?? [];
  }

  /** Musonic Server: a show and its episodes, followed or not (`url` reads a show the server does not know). */
  async getPodcastShow(show: { id?: string; url?: string }, signal?: AbortSignal): Promise<PodcastChannel> {
    const res = await this.request<{ podcastShow: PodcastChannel }>('getPodcastShow', { id: show.id, url: show.url }, signal);
    return { ...res.podcastShow, episode: res.podcastShow.episode ?? [] };
  }

  /** The shows the account follows (without their episodes unless asked). */
  async getPodcasts(includeEpisodes = false, signal?: AbortSignal): Promise<PodcastChannel[]> {
    const res = await this.request<{ podcasts?: { channel?: PodcastChannel[] } }>('getPodcasts', { includeEpisodes }, signal);
    return (res.podcasts?.channel ?? []).map((c) => ({ ...c, episode: c.episode ?? [] }));
  }

  async getNewestPodcasts(count = 20, signal?: AbortSignal): Promise<PodcastEpisode[]> {
    const res = await this.request<{ newestPodcasts?: { episode?: PodcastEpisode[] } }>('getNewestPodcasts', { count }, signal);
    return res.newestPodcasts?.episode ?? [];
  }

  async followPodcast(feedUrl: string, signal?: AbortSignal): Promise<void> {
    await this.request('createPodcastChannel', { url: feedUrl }, signal);
  }

  async unfollowPodcast(id: string, signal?: AbortSignal): Promise<void> {
    await this.request('deletePodcastChannel', { id }, signal);
  }

  /** Musonic Server: where the account stopped in an episode (ms), kept for every device. */
  async savePodcastPosition(id: string, positionMs: number, signal?: AbortSignal): Promise<void> {
    await this.request('savePodcastPosition', { id, position: Math.max(0, Math.round(positionMs)) }, signal);
  }

  streamUrl(id: string): string {
    return this.buildUrl('stream', { id });
  }

  /** Cover image URL. Contains the token: keep it in memory only. */
  coverArtUrl(id: string, size?: number): string {
    return this.buildUrl('getCoverArt', { id, size });
  }
}
