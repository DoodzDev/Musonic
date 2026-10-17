/**
 * @file playerArtwork.ts
 * @description Cover given to the native player. The player publishes it in
 *   the media session (`ART_URI`), which other apps can read (notification
 *   access, smartwatches, Android Auto…), and a server cover URL carries the
 *   account credentials. So the player only gets `content://<package>.artwork/<key>`:
 *   Musonic's own provider reads the local file or downloads the cover itself.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {NativeModules, Platform} from 'react-native';
import {getCoverArtUrl} from '../api/client';

type Native = {
  registerArtwork(key: string, uri: string): void;
  getConstants?: () => {artworkAuthority?: string};
  artworkAuthority?: string;
};

const native: Native | undefined = Platform.OS === 'android' ? NativeModules.MusonicAuto : undefined;
const authority: string | undefined =
  native?.getConstants?.().artworkAuthority ?? native?.artworkAuthority;

/** Last source sent to native for each key: registering is a bridge call, done once. */
const registered = new Map<string, string>();

/** True for a cover URI made here (only valid for this process: rebuilt, never saved). */
export function isPlayerArtworkUri(uri: string | undefined): boolean {
  return !!authority && !!uri && uri.startsWith(`content://${authority}/`);
}

type ArtworkTrack = {id: string; coverArt?: string; artwork?: string};

/**
 * The cover URI to hand to the player for `track`. Falls back to the original
 * artwork when the provider is not there (iOS, tests).
 */
export function playerArtwork(track: ArtworkTrack): string {
  const key = `track_${track.coverArt || track.id}`;
  let source = track.artwork ?? '';
  // Already one of ours (queue read back from the player): keep its source.
  if (isPlayerArtworkUri(source)) source = registered.get(key) ?? '';
  if (!source) {
    try {
      source = getCoverArtUrl(track.coverArt || track.id, 300);
    } catch {
      return ''; // no server configured
    }
  }
  if (!native || !authority) return source;
  if (registered.get(key) !== source) {
    registered.set(key, source);
    native.registerArtwork(key, source);
  }
  return `content://${authority}/${encodeURIComponent(key)}`;
}
