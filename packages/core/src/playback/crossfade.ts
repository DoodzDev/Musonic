/**
 * @file crossfade.ts
 * @description Crossfade rule (E3), shared by the clients: when the next track
 *   starts fading in over the end of the current one, and when it does not.
 *   No fade on a manual next / previous (the engine never asks then), with
 *   repeat one, with the sleep timer set to the end of the track, at the end of
 *   the queue, or on a track shorter than twice the fade.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

import type { RepeatMode } from './buildQueue.ts';

/** Longest crossfade the settings offer, in seconds. */
export const MAX_CROSSFADE = 12;

export interface CrossfadeInput {
  /** Chosen length in seconds (0 = off). */
  setting: number;
  /** Current position in the playing track, in seconds. */
  position: number;
  /** Length of the playing track, in seconds. */
  duration: number;
  repeat: RepeatMode;
  /** The sleep timer stops playback at the end of this track. */
  endOfTrack: boolean;
  /** Something comes after this track. */
  hasNext: boolean;
}

/**
 * Length of the fade to start now, in seconds, or null when the track must
 * play to its end as usual. Positions arrive a few times a second, so a fade
 * noticed a little late is shortened to the time left.
 */
export function crossfadeLength({ setting, position, duration, repeat, endOfTrack, hasNext }: CrossfadeInput): number | null {
  if (!(setting > 0) || repeat === 'one' || endOfTrack || !hasNext) return null;
  if (!Number.isFinite(duration) || duration < 2 * setting) return null;
  const left = duration - position;
  if (left > setting || left <= 0) return null;
  return left;
}
