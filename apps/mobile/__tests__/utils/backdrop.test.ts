/**
 * @file backdrop.test.ts
 * @description Unit tests for the darkening of the full player's blurred cover.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {backdropDim} from '../../src/utils/backdrop';

describe('backdropDim', () => {
  it('darkens light covers enough for white text', () => {
    const dim = backdropDim('#F2EEE0');
    const after = (0xf2 + 0xee + 0xe0) / (3 * 255) * (1 - dim);
    expect(after).toBeLessThanOrEqual(0.4 + 1e-9);
  });

  it('keeps a light touch on dark covers', () => {
    expect(backdropDim('#202840')).toBe(0.25);
  });

  it('never goes fully black', () => {
    expect(backdropDim('#FFFFFF')).toBeCloseTo(0.6);
    expect(backdropDim('#FFFFFF')).toBeLessThanOrEqual(0.7);
  });

  it('falls back on a malformed colour', () => {
    expect(backdropDim('rgb(1,2,3)')).toBe(0.25);
  });
});
