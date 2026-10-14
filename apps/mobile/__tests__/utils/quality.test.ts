/**
 * @file quality.test.ts
 * @description Unit tests for the full player's quality label.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {qualityLabel} from '../../src/utils/quality';

describe('qualityLabel', () => {
  it('shows lossless formats alone', () => {
    expect(qualityLabel({suffix: 'flac', bitRate: 1011})).toBe('FLAC');
    expect(qualityLabel({suffix: 'WAV'})).toBe('WAV');
  });

  it('shows lossy formats with their bit rate', () => {
    expect(qualityLabel({suffix: 'mp3', bitRate: 320})).toBe('MP3 320');
    expect(qualityLabel({suffix: 'opus', bitRate: 128})).toBe('OPUS 128');
    expect(qualityLabel({suffix: 'ogg'})).toBe('OGG');
  });

  it('tells AAC from ALAC inside m4a', () => {
    expect(qualityLabel({suffix: 'm4a', bitRate: 256})).toBe('AAC 256');
    expect(qualityLabel({suffix: 'm4a', bitRate: 900})).toBe('ALAC');
  });

  it('returns null when the server gives no format', () => {
    expect(qualityLabel({})).toBeNull();
    expect(qualityLabel({suffix: '  ', bitRate: 320})).toBeNull();
  });
});
