/**
 * @file quality.ts
 * @description Short audio quality label shown under the full player's
 *   progress bar: the real format of the file, e.g. `FLAC`, `MP3 320`.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

/** Lossless formats: the format alone says it all, the bit rate is noise. */
const LOSSLESS = new Set(['flac', 'alac', 'wav', 'aif', 'aiff', 'ape', 'wv', 'dsf', 'dff']);

/** `m4a` holds either AAC (lossy) or ALAC (lossless): ALAC runs far above this bit rate. */
const ALAC_MIN_KBPS = 500;

/** Label for a song's format and bit rate (kbps), or null when the server does not say. */
export function qualityLabel(song: {suffix?: string; bitRate?: number}): string | null {
  const suffix = song.suffix?.trim().toLowerCase();
  if (!suffix) return null;
  const kbps = song.bitRate && song.bitRate > 0 ? Math.round(song.bitRate) : undefined;
  if (LOSSLESS.has(suffix)) return suffix.toUpperCase();
  if (suffix === 'm4a') {
    if (kbps && kbps >= ALAC_MIN_KBPS) return 'ALAC';
    return kbps ? `AAC ${kbps}` : 'AAC';
  }
  return kbps ? `${suffix.toUpperCase()} ${kbps}` : suffix.toUpperCase();
}
