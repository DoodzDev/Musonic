/**
 * @file tokens.ts
 * @description Design v2 tokens: colours, glass blur, spacing, radii and touch sizes.
 *   New components read these instead of hard-coded values. The legacy
 *   `darkTheme` in colors.ts stays in place for the current screens until they
 *   are rebuilt on these tokens.
 * @author DoodzProg
 * @version 1.2.0
 * @license CC-BY-NC-4.0
 */

export const colors = {
  /** Pure black app background. */
  background: '#000000',
  /** Grouped content: cards, list sections, sheets. */
  surface1: '#1C1C1E',
  /** Raised content on top of surface1. */
  surface2: '#2C2C2E',
  /** Translucent fill for secondary buttons, chips and segmented controls. */
  fill: 'rgba(118,118,128,0.24)',
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(235,235,245,0.62)',
  /** Hairline separators (0.5 pt). */
  separator: 'rgba(84,84,88,0.55)',
  /** Single accent, reserved for the active state and primary actions. */
  accent: '#FF6B35',
  /** Glyphs drawn on top of the accent (7:1 contrast). */
  onAccent: '#1A0A04',
  /** Downloaded / success state. */
  success: '#30D158',
  destructive: '#FF6961',
  /** Selected segment of a segmented control. */
  segmentThumb: '#636366',
  /** Light fill behind neutral badges. */
  badgeFill: 'rgba(255,255,255,0.12)',
  /** Accent at low opacity, behind accent text (Magic badge, active toggles). */
  accentFill: 'rgba(255,107,53,0.2)',
  /** Success at low opacity, behind the Downloaded badge. */
  successFill: 'rgba(48,209,88,0.18)',
  /** Tint laid over the blur of floating glass (dock, mini player). */
  glassTint: 'rgba(44,44,48,0.68)',
  /** Opaque stand-in for glass where blur is off or unsupported. */
  glassFallback: 'rgba(28,28,30,0.92)',
} as const;

/** Blur strength of floating glass (0-100, about a 28 px radius). */
export const GLASS_BLUR = 28;

export type ColorToken = keyof typeof colors;

/** 8 pt grid, with a 4 pt half step for tight spots. */
export const spacing = {
  xs: 4,
  s: 8,
  m: 16,
  l: 24,
  xl: 32,
  xxl: 40,
  xxxl: 48,
  /** Side margin of every screen. */
  gutter: 20,
} as const;

export const radii = {
  /** Cover art in list rows. */
  cover: 8,
  /** Tiles and text fields. */
  tile: 12,
  /** Buttons and hero covers. */
  button: 14,
  card: 20,
  /** Floating glass capsules (dock, mini player). */
  capsule: 28,
  /** Avatars and pills. */
  full: 999,
} as const;

/**
 * Concentric corners: a shape nested inside another, with `padding` between
 * them, uses the outer radius minus that padding.
 */
export function concentricRadius(outerRadius: number, padding: number): number {
  return Math.max(0, outerRadius - padding);
}

export const sizes = {
  /** Minimum touch target, everywhere. */
  touchTarget: 44,
  listRowMin: 52,
  listRowMax: 72,
  hairline: 0.5,
} as const;
