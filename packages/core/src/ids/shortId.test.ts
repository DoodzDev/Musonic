/**
 * @file shortId.test.ts
 * @description The clients' short ids must be the server's: same vectors as
 *   `apps/server/src/ids.rs`.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { describe, expect, it } from 'vitest';
import { toShortId } from './shortId.ts';

describe('toShortId', () => {
  it('gives the server short id of an old UUID', () => {
    expect(toShortId('0c3c5e47-6f22-5dfe-ab18-9987368e4dac')).toBe('1387MiQJoB4');
    expect(toShortId('5220a049-bd94-47ae-8d35-2ca090cfb168')).toBe('73A4WPDHD9a');
    expect(toShortId('5220A049-BD94-47AE-8D35-2CA090CFB168')).toBe('73A4WPDHD9a');
  });

  it('covers the whole 64-bit range', () => {
    expect(toShortId('00000000-0000-0000-ffff-ffffffffffff')).toBe('00000000000');
    expect(toShortId('ffffffff-ffff-ffff-0000-000000000000')).toBe('LygHa16AHYF');
  });

  it('keeps the first 11 characters of a Navidrome id', () => {
    expect(toShortId('4xDzN7lF2pq1Hc0Ab9Zk3s')).toBe('4xDzN7lF2pq');
  });

  it('keeps cover prefixes', () => {
    expect(toShortId('pl-0c3c5e47-6f22-5dfe-ab18-9987368e4dac')).toBe('pl-1387MiQJoB4');
    expect(toShortId('ar-4xDzN7lF2pq1Hc0Ab9Zk3s')).toBe('ar-4xDzN7lF2pq');
    expect(toShortId('pl-1387MiQJoB4')).toBe('pl-1387MiQJoB4');
  });

  it('leaves other ids as they are', () => {
    for (const id of ['73A4WPDHD9a', 'dz-track-1001', 'ext-deezer-song-1', '4xDzN7lF2pq1Hc0Ab9Zk3-', '', 'liked']) {
      expect(toShortId(id)).toBe(id);
    }
  });
});
