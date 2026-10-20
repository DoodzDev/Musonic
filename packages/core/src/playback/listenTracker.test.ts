/**
 * @file listenTracker.test.ts
 * @description Unit tests of the scrobble rule: time really listened only.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import { describe, expect, it } from 'vitest';
import { ListenTracker, scrobbleThreshold } from './listenTracker.ts';

/** Reports positions from `from` to `to` every quarter second. */
function play(t: ListenTracker, from: number, to: number) {
  for (let p = from; p <= to; p += 0.25) t.progress(p);
}

describe('scrobbleThreshold', () => {
  it('is half the track, at most 4 minutes, none under 30 s', () => {
    expect(scrobbleThreshold(200)).toBe(100);
    expect(scrobbleThreshold(600)).toBe(240);
    expect(scrobbleThreshold(29)).toBeNull();
    expect(scrobbleThreshold(NaN)).toBeNull();
  });
});

describe('ListenTracker', () => {
  it('counts a play once the threshold is listened, only once', () => {
    const t = new ListenTracker(200);
    play(t, 0, 99);
    expect(t.takeScrobble()).toBe(false);
    play(t, 99, 101);
    expect(t.takeScrobble()).toBe(true);
    expect(t.takeScrobble()).toBe(false);
  });

  it('does not count jumps: 10 s at the start and 10 s at the end is not a play', () => {
    const t = new ListenTracker(200);
    play(t, 0, 10);
    t.progress(190); // seek without interrupt: the jump is too big to count
    play(t, 190, 200);
    expect(t.listenedSeconds).toBeCloseTo(20);
    expect(t.takeScrobble()).toBe(false);
  });

  it('does not count small jumps after an interruption, nor going back', () => {
    const t = new ListenTracker(200);
    play(t, 0, 50);
    t.interrupt();
    play(t, 55, 60);
    t.progress(40);
    play(t, 40, 45);
    expect(t.listenedSeconds).toBeCloseTo(60);
  });

  it('uses a length learned later', () => {
    const t = new ListenTracker();
    play(t, 0, 40);
    expect(t.takeScrobble()).toBe(false);
    t.duration = 60;
    expect(t.takeScrobble()).toBe(true);
  });
});
