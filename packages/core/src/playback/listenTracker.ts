/**
 * @file listenTracker.ts
 * @description When a play counts (scrobble): the Last.fm rule, half of the
 *   track or 4 minutes, whichever comes first, never under 30 s. Counts the
 *   time really listened: jumps (seeking) and pauses add nothing, so skipping
 *   to the end is not a play.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

export const SCROBBLE_MIN_DURATION = 30;
export const SCROBBLE_MAX_THRESHOLD = 240;

/**
 * Longest gap between two position updates still counted as listening.
 * Players report every ~0.25 s; a background tab may report less often.
 */
const MAX_STEP = 10;

/** Seconds to listen for a play to count, or null when the track is too short. */
export function scrobbleThreshold(duration: number): number | null {
  if (!(duration >= SCROBBLE_MIN_DURATION)) return null;
  return Math.min(duration * 0.5, SCROBBLE_MAX_THRESHOLD);
}

export class ListenTracker {
  /** Track length in seconds; may be learned once the audio is loaded. */
  duration: number;
  private listened = 0;
  private last: number | null = null;
  private submitted = false;

  constructor(duration = 0) {
    this.duration = duration;
  }

  /** A position reported while playing. */
  progress(position: number): void {
    if (this.last !== null) {
      const step = position - this.last;
      if (step > 0 && step <= MAX_STEP) this.listened += step;
    }
    this.last = position;
  }

  /** Paused or seeking: the next position starts a new stretch. */
  interrupt(): void {
    this.last = null;
  }

  get listenedSeconds(): number {
    return this.listened;
  }

  /** True once, when the play counts and was not reported yet. */
  takeScrobble(): boolean {
    const threshold = scrobbleThreshold(this.duration);
    if (this.submitted || threshold === null || this.listened < threshold) return false;
    this.submitted = true;
    return true;
  }
}
