/**
 * @file shadows.ts
 * @description Design v2 elevation: card, tinted hero cover and floating glass.
 *   Uses the cross-platform `boxShadow` style (New Architecture), so iOS and
 *   Android render the same shadow. Never put a shadow on list rows.
 * @author DoodzProg
 * @version 1.2.0
 * @license CC-BY-NC-4.0
 */
import type {ViewStyle} from 'react-native';
import {hexToRgba} from '../utils/colorUtils';

export const shadows = {
  card: {boxShadow: '0px 12px 32px rgba(0,0,0,0.40)'},
  /** Drop shadow under floating glass. */
  glass: {boxShadow: '0px 10px 30px rgba(0,0,0,0.45)'},
  /**
   * Light edge of floating glass. Inset shadows draw under children, so this
   * goes on an overlay above the blur, not on the glass container itself.
   */
  glassEdge: {
    boxShadow:
      'inset 0px 0.5px 0px rgba(255,255,255,0.18), inset 0px 0px 0px 0.5px rgba(255,255,255,0.08)',
  },
  /**
   * "Raised" relief (Design v2, P5): the soft drop shadow of covers and cards
   * on the Home, slightly lighter than `card`. Pairs with `raisedEdge`.
   */
  raised: {boxShadow: '0px 8px 24px rgba(0,0,0,0.35)'},
  /**
   * Fine light edge of a raised surface: a brighter top line and a faint
   * outline, like the glass of the mini player, so the surface reads as a
   * slightly 3D "button". Goes on an overlay above the content (see `Raised`).
   */
  raisedEdge: {
    boxShadow:
      'inset 0px 0.5px 0px rgba(255,255,255,0.14), inset 0px 0px 0px 0.5px rgba(255,255,255,0.08)',
  },
} as const satisfies Record<string, ViewStyle>;

/** Hero cover shadow, tinted with the cover's dominant colour (`#RRGGBB`). */
export function heroShadow(tint: string): ViewStyle {
  return {
    boxShadow: `0px 24px 60px ${hexToRgba(tint, 0.35)}, 0px 8px 20px rgba(0,0,0,0.50)`,
  };
}
