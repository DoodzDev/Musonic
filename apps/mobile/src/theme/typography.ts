/**
 * @file typography.ts
 * @description Design v2 type scale. Uses the system font (Roboto on Android,
 *   SF on iOS): no fontFamily is set. Rendered by the `Text` component.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import type {TextStyle} from 'react-native';

type TypeStyle = Required<
  Pick<TextStyle, 'fontSize' | 'lineHeight' | 'fontWeight' | 'letterSpacing'>
>;

export const typography = {
  largeTitle: {fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: -0.4},
  title1: {fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.4},
  title2: {fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.4},
  title3: {fontSize: 20, lineHeight: 25, fontWeight: '600', letterSpacing: -0.4},
  headline: {fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.4},
  body: {fontSize: 17, lineHeight: 22, fontWeight: '400', letterSpacing: -0.4},
  callout: {fontSize: 16, lineHeight: 21, fontWeight: '400', letterSpacing: -0.3},
  subhead: {fontSize: 15, lineHeight: 20, fontWeight: '400', letterSpacing: -0.2},
  footnote: {fontSize: 13, lineHeight: 18, fontWeight: '400', letterSpacing: -0.1},
  caption: {fontSize: 11, lineHeight: 13, fontWeight: '600', letterSpacing: 0.1},
} as const satisfies Record<string, TypeStyle>;

export type TextVariant = keyof typeof typography;

/**
 * Upper bound for the OS font-size setting. Large text stays readable without
 * breaking fixed-height layouts (rows, capsules, the dock).
 */
export const MAX_FONT_SCALE = 1.3;
