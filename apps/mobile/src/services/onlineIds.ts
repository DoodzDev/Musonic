/**
 * @file onlineIds.ts
 * @description Ids of Deezer albums and songs from outside the library ("For
 *   you", search, autoplay, magic mixes). Musonic Server reads `dz-album-…` /
 *   `dz-track-…`; a classic OctoFiesta proxy reads `ext-deezer-album-…` /
 *   `ext-deezer-song-…`. The server kind comes from the connectivity ping;
 *   until the first answer, Musonic Server is assumed.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

let musonicServer = true;

/** Called on every server ping with whether it is Musonic Server. */
export function setMusonicServer(isMusonic: boolean): void {
  musonicServer = isMusonic;
}

/** Id of a Deezer album, as the active server reads it. */
export function deezerAlbumId(deezerId: number | string): string {
  return musonicServer ? `dz-album-${deezerId}` : `ext-deezer-album-${deezerId}`;
}

/** Id of a Deezer song, as the active server reads it. */
export function deezerSongId(deezerId: number | string): string {
  return musonicServer ? `dz-track-${deezerId}` : `ext-deezer-song-${deezerId}`;
}

/** A song or album from the online catalogue, not (yet) in the library: never downloadable. */
export function isOnlineId(id: string | number): boolean {
  const s = String(id);
  return s.startsWith('ext-') || s.startsWith('dz-');
}
