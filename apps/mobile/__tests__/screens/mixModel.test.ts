/**
 * @file mixModel.test.ts
 * @description Tests of the Magic Mix rules: discovery count and blending.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {blendDiscoveries, discoveryCount} from '../../src/screens/MixDetail/mixModel';

describe('discoveryCount', () => {
  it('makes discoveries about 30 % of the mix', () => {
    expect(discoveryCount(30)).toBe(13);
    expect(discoveryCount(7)).toBe(3);
  });

  it('asks for none without own songs', () => {
    expect(discoveryCount(0)).toBe(0);
  });
});

describe('blendDiscoveries', () => {
  const own = ['a', 'b', 'c', 'd', 'e', 'f'];

  it('spreads discoveries evenly and never first', () => {
    expect(blendDiscoveries(own, ['X', 'Y'])).toEqual(['a', 'b', 'c', 'X', 'd', 'e', 'f', 'Y']);
  });

  it('keeps every song once', () => {
    const out = blendDiscoveries(own, ['X', 'Y', 'Z', 'W']);
    expect([...out].sort()).toEqual([...own, 'X', 'Y', 'Z', 'W'].sort());
    expect(out[0]).toBe('a');
  });

  it('appends leftover discoveries at the end', () => {
    expect(blendDiscoveries(['a'], ['X', 'Y'])).toEqual(['a', 'X', 'Y']);
  });

  it('handles empty lists', () => {
    expect(blendDiscoveries(own, [])).toEqual(own);
    expect(blendDiscoveries([], ['X'])).toEqual(['X']);
  });
});
