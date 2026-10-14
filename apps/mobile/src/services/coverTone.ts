/**
 * @file coverTone.ts
 * @description Colours of a cover used as a blurred background: its plain
 *   average colour (to fill around the image) and how much to darken it so
 *   white text stays readable. Read once per cover (react-native-image-colors
 *   keeps its own cache).
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import ImageColors from 'react-native-image-colors';
import {backdropDim} from '../utils/backdrop';

export const DEFAULT_TONE = {fill: '#0A0A0B', dim: 0.45};

export type CoverTone = {fill: string; dim: number};

export async function coverTone(uri: string): Promise<CoverTone> {
  try {
    const result = await ImageColors.getColors(uri, {cache: true, key: uri});
    const average = result.platform === 'android' ? result.average
      : result.platform === 'ios' ? result.background
      : undefined;
    // The colour covering most of the cover (dominant) matters most for the darkening: a cream
    // cover with a dark centre averages to mid grey but still shows cream behind the text.
    const main = result.platform === 'android' ? [result.dominant, result.average]
      : result.platform === 'ios' ? [result.background, result.primary]
      : [];
    const known = main.filter((c): c is string => !!c);
    return {
      fill: average ?? DEFAULT_TONE.fill,
      dim: known.length > 0 ? Math.max(...known.map(backdropDim)) : DEFAULT_TONE.dim,
    };
  } catch {
    return DEFAULT_TONE;
  }
}
