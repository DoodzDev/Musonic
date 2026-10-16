/**
 * @file pickArtist.test.ts
 * @description Deezer artist lookup picks the real artist over namesakes.
 * @author DoodzProg
 * @license CC-BY-NC-4.0
 */
import {pickArtist, type DeezerArtist} from '../../src/api/deezer';

const a = (id: number, name: string, nb_fan?: number): DeezerArtist =>
  ({id, name, picture_medium: '', picture_xl: '', nb_fan});

describe('pickArtist', () => {
  it('prefers the same name with the most fans', () => {
    expect(pickArtist([a(1, 'Vald', 257), a(2, 'Vald', 1406148), a(3, 'Charles Vald', 174)], 'vald')?.id).toBe(2);
  });

  it('ignores accents and case', () => {
    expect(pickArtist([a(1, 'Beyonce', 10), a(2, 'Beyoncé', 900)], 'BEYONCE')?.id).toBe(2);
  });

  it('falls back on the first result, or null', () => {
    expect(pickArtist([a(5, 'Other', 1)], 'Nobody')?.id).toBe(5);
    expect(pickArtist([], 'Nobody')).toBeNull();
  });
});
