/**
 * @file homeSource.ts
 * @description Feeds the shared home engine (`@musonic/core/home`) from the
 *   mobile app's own API layer: the same server calls as the web client's
 *   `SubsonicClient`, answered through `subsonicGet`. On a Musonic Server each
 *   wave is one request (ADR-021); the engine falls back by itself elsewhere.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import type {HomeSource} from '@musonic/core/home';
import {subsonicGet} from '../../api/client';

export const homeSource: HomeSource = {
  async getAlbumList(type, options = {}) {
    const res = await subsonicGet<any>('getAlbumList2.view', {type, ...options});
    return res.albumList2?.album ?? [];
  },
  async getStarred() {
    const res = await subsonicGet<any>('getStarred2.view');
    return {song: res.starred2?.song ?? [], album: res.starred2?.album ?? [], artist: res.starred2?.artist ?? []};
  },
  async getPlaylists() {
    const res = await subsonicGet<any>('getPlaylists.view');
    return res.playlists?.playlist ?? [];
  },
  async getArtistInfo(id, count = 10) {
    const res = await subsonicGet<any>('getArtistInfo2.view', {id, count});
    return {biography: res.artistInfo2?.biography, similarArtist: res.artistInfo2?.similarArtist ?? []};
  },
  async getArtist(id) {
    const res = await subsonicGet<any>('getArtist.view', {id});
    return {...res.artist, album: res.artist?.album ?? []};
  },
  async getSimilarSongs(id, count = 20) {
    const res = await subsonicGet<any>('getSimilarSongs2.view', {id, count});
    return res.similarSongs2?.song ?? [];
  },
  async getRandomSongs(options = {}) {
    const res = await subsonicGet<any>('getRandomSongs.view', options);
    return res.randomSongs?.song ?? [];
  },
  async getMusonicHome() {
    const home = (await subsonicGet<any>('getMusonicHome.view')).musonicHome;
    if (!home) throw new Error('Not a Musonic Server');
    return {
      recent: home.recent ?? [],
      frequent: home.frequent ?? [],
      newest: home.newest ?? [],
      random: home.random ?? [],
      starred: {song: home.starred?.song ?? [], album: home.starred?.album ?? [], artist: home.starred?.artist ?? []},
      playlists: home.playlists ?? [],
    };
  },
  async getMusonicHomeMore(seeds) {
    const params: Record<string, unknown> = {genre: seeds.genres};
    if (seeds.styleArtist) params.artist = seeds.styleArtist.id;
    if (seeds.likedSong) params.song = seeds.likedSong.id;
    const more = (await subsonicGet<any>('getMusonicHomeMore.view', params)).musonicHomeMore;
    if (!more) throw new Error('Not a Musonic Server');
    return {
      similarArtistAlbums: more.similarArtistAlbums ?? [],
      similarSongs: more.similarSongs ?? [],
      genreMixes: (more.genreMixes ?? []).map((m: {genre: string; song?: unknown[]}) => ({genre: m.genre, songs: m.song ?? []})),
    };
  },
};
