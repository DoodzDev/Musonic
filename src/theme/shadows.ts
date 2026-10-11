/**
 * @file shadows.ts
 * @description Design v2 elevation: card, tinted hero cover and floating glass.
 *   Uses the cross-platform `boxShadow` style (New Architecture), so iOS and
 *   Android render the same shadow. Never put a shadow on list rows.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import type {ViewStyle} from 'react-native';
import {hexToRgba} from '../utils/colorUtils';

export const shadows = {
  card: {boxShadow: '0px 12px 32px rgba(0,0,0,0.40)'},
  glass: {
    boxShadow:
      '0px 10px 30px rgba(0,0,0,0.45), inset 0px 0.5px 0px rgba(255,255,255,0.18), inset 0px 0px 0px 0.5px rgba(255,255,255,0.08)',
  },
} as const satisfies Record<string, ViewStyle>;

/** Hero cover shadow, tinted with the cover's dominant colour (`#RRGGBB`). */
export function heroShadow(tint: string): ViewStyle {
  return {
    boxShadow: `0px 24px 60px ${hexToRgba(tint, 0.35)}, 0px 8px 20px rgba(0,0,0,0.50)`,
  };
}
