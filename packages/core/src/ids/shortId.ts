/**
 * @file shortId.ts
 * @description Short ids of Musonic Server (ADR-026): what it shows (songs,
 *   albums, artists, folders, playlists) went from UUIDs to 11 characters of
 *   base 62. The short id is computed from the old one, exactly as the server
 *   does (`apps/server/src/ids.rs`, same test vectors): clients convert the ids
 *   they kept without asking the server. Dependency-free (no BigInt: Hermes).
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const SHORT_ID_LENGTH = 11;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Ids Navidrome gives (random base 62), kept by an import from Navidrome. */
const NAVIDROME = /^[0-9A-Za-z]{22}$/;

/** `musonicServer` extension version from which the server uses short ids. */
export const SHORT_IDS_VERSION = 3;

/** 16 hex digits (64 bits) in base 62, always 11 characters. */
function base62(hex: string): string {
  // Four 16-bit limbs, divided by 62 again and again.
  const limbs = [0, 4, 8, 12].map(i => parseInt(hex.slice(i, i + 4), 16));
  let out = '';
  for (let n = 0; n < SHORT_ID_LENGTH; n++) {
    let rest = 0;
    for (let i = 0; i < limbs.length; i++) {
      const v = rest * 0x10000 + limbs[i];
      limbs[i] = Math.floor(v / 62);
      rest = v % 62;
    }
    out = BASE62[rest] + out;
  }
  return out;
}

function bare(id: string): string {
  if (UUID.test(id)) return base62(id.replace(/-/g, '').slice(0, 16));
  if (NAVIDROME.test(id)) return id.slice(0, SHORT_ID_LENGTH);
  return id;
}

/**
 * The current form of an id: an old UUID becomes its first 64 bits, an id
 * kept from Navidrome its first 11 characters, also after a cover prefix
 * (`pl-…`, `ar-…`); anything else (short ids, online ids `dz-…` / `ext-…`,
 * empty) is returned as it is.
 */
export function toShortId(id: string): string {
  const prefix = /^(pl-|ar-)/.exec(id)?.[0];
  return prefix ? prefix + bare(id.slice(prefix.length)) : bare(id);
}
