/**
 * @file colorUtils.test.ts
 * @description Unit tests for time formatting and colour helpers.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {blendWithBlack, colorFromId, formatTime, hexToRgba} from '../../src/utils/colorUtils';

describe('formatTime', () => {
  it('formats seconds as m:ss', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(3600)).toBe('60:00');
  });

  it('floors fractions and clamps negative values', () => {
    expect(formatTime(59.9)).toBe('0:59');
    expect(formatTime(-3)).toBe('0:00');
  });
});

describe('blendWithBlack', () => {
  it('darkens a colour by the given factor', () => {
    expect(blendWithBlack('#ffffff', 0.5)).toBe('#808080');
    expect(blendWithBlack('ffffff', 0)).toBe('#ffffff');
    expect(blendWithBlack('#ffffff', 1)).toBe('#000000');
  });

  it('falls back to a neutral dark grey on malformed input', () => {
    expect(blendWithBlack('#fff')).toBe('#282828');
  });
});

describe('colorFromId', () => {
  it('is deterministic and returns a hex colour', () => {
    expect(colorFromId('album-42')).toBe(colorFromId('album-42'));
    expect(colorFromId('album-42')).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('hexToRgba', () => {
  it('converts #RRGGBB with alpha', () => {
    expect(hexToRgba('#FF6B35', 0.35)).toBe('rgba(255,107,53,0.35)');
    expect(hexToRgba('000000', 1)).toBe('rgba(0,0,0,1)');
  });

  it('falls back to black on malformed input', () => {
    expect(hexToRgba('#FFF', 0.5)).toBe('rgba(0,0,0,0.5)');
  });
});
