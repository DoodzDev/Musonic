/**
 * @file lrclib.test.ts
 * @description Tests for the LRC parser and the choice among LRCLIB results.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { describe, expect, it } from 'vitest';
import { parseLrc, pickLrclib } from './lrclib.ts';

describe('parseLrc', () => {
  it('reads timestamps with 2 or 3 decimals and skips empty lines', () => {
    expect(parseLrc('[00:01.50] Hello\r\n[01:02.123]World\n[00:03.00]\nno tag')).toEqual([
      { start: 1500, value: 'Hello' },
      { start: 62123, value: 'World' },
    ]);
  });
});

describe('pickLrclib', () => {
  const synced = (duration: number, words: string) => ({ duration, syncedLyrics: `[00:01.00]${words}`, plainLyrics: words });

  it('prefers synced lyrics with the closest duration', () => {
    const best = pickLrclib([synced(200, 'far'), synced(181, 'close'), synced(190, 'mid')], 180);
    expect(best).toEqual({ synced: true, line: [{ start: 1000, value: 'close' }] });
  });

  it('ignores synced lyrics of another length, falls back to plain text', () => {
    const best = pickLrclib([synced(240, 'other version')], 180);
    expect(best).toEqual({ synced: false, line: [{ value: 'other version' }] });
  });

  it('accepts any synced lyrics when the duration is unknown', () => {
    expect(pickLrclib([synced(240, 'x')])?.synced).toBe(true);
  });

  it('returns null when nothing is usable', () => {
    expect(pickLrclib([{ plainLyrics: '  ' }, {}], 100)).toBeNull();
  });
});
