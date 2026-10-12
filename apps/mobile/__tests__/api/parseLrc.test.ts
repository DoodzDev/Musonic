/**
 * @file parseLrc.test.ts
 * @description Unit tests for the LRC synced-lyrics parser.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
jest.mock('../../src/api/client', () => ({subsonicGet: jest.fn()}));

import {parseLrc} from '../../src/api/endpoints/library';

describe('parseLrc', () => {
  it('converts [mm:ss.xx] timestamps to milliseconds', () => {
    expect(parseLrc('[00:12.34] Hello\n[01:02.50] World')).toEqual([
      {start: 12340, value: 'Hello'},
      {start: 62500, value: 'World'},
    ]);
  });

  it('accepts three-digit fractions', () => {
    expect(parseLrc('[00:01.005]Line')).toEqual([{start: 1005, value: 'Line'}]);
  });

  it('skips metadata tags, malformed lines and empty lyrics', () => {
    const lrc = '[ar:Artist]\n[ti:Title]\nno timestamp\n[00:05.00]   \n[00:06.00] Kept';
    expect(parseLrc(lrc)).toEqual([{start: 6000, value: 'Kept'}]);
  });

  it('returns an empty list for empty input', () => {
    expect(parseLrc('')).toEqual([]);
  });
});
