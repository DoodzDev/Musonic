/**
 * @file crossfade.test.ts
 * @description Unit tests of the crossfade rule (E3).
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import { describe, expect, it } from 'vitest';
import { crossfadeLength, type CrossfadeInput } from './crossfade.ts';

const base: CrossfadeInput = { setting: 6, position: 194, duration: 200, repeat: 'none', endOfTrack: false, hasNext: true };

describe('crossfadeLength', () => {
  it('starts the fade when the time left reaches the setting', () => {
    expect(crossfadeLength(base)).toBe(6);
    expect(crossfadeLength({ ...base, position: 193 })).toBeNull();
  });

  it('shortens a fade noticed late to the time left', () => {
    expect(crossfadeLength({ ...base, position: 195.5 })).toBe(4.5);
  });

  it('is off at 0', () => {
    expect(crossfadeLength({ ...base, setting: 0 })).toBeNull();
  });

  it('never fades with repeat one, the end-of-track sleep timer or nothing next', () => {
    expect(crossfadeLength({ ...base, repeat: 'one' })).toBeNull();
    expect(crossfadeLength({ ...base, endOfTrack: true })).toBeNull();
    expect(crossfadeLength({ ...base, hasNext: false })).toBeNull();
  });

  it('fades with repeat all', () => {
    expect(crossfadeLength({ ...base, repeat: 'all' })).toBe(6);
  });

  it('skips tracks shorter than twice the fade, or of unknown length', () => {
    expect(crossfadeLength({ ...base, duration: 11.9, position: 6 })).toBeNull();
    expect(crossfadeLength({ ...base, duration: 12, position: 6 })).toBe(6);
    expect(crossfadeLength({ ...base, duration: NaN })).toBeNull();
  });

  it('does nothing once the track is over', () => {
    expect(crossfadeLength({ ...base, position: 200 })).toBeNull();
  });
});
