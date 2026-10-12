/**
 * @file tokens.ts
 * @description Design v2 colour tokens, identical to the mobile app (apps/mobile/src/theme/tokens.ts).
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

export const colors = {
  background: '#000000',
  surface1: '#1C1C1E',
  surface2: '#2C2C2E',
  fill: 'rgba(118,118,128,0.24)',
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(235,235,245,0.62)',
  separator: 'rgba(84,84,88,0.55)',
  accent: '#FF6B35',
  onAccent: '#1A0A04',
  success: '#30D158',
  destructive: '#FF6961',
  accentFill: 'rgba(255,107,53,0.2)',
  glassTint: 'rgba(44,44,48,0.68)',
  /** Mode icons when inactive (shuffle, repeat), as on mobile. */
  iconInactive: 'rgba(255,255,255,0.7)',
} as const;

/** Liked Songs cover: same gradient and white heart as the mobile Library. */
export const LIKED_GRADIENT = 'linear-gradient(135deg, #6B2FA0 0%, #1E3A8A 100%)';
/** Liked Songs quick access tint on the mobile Home (#5038A0 at 20 %). */
export const LIKED_TINT = 'rgba(80,56,160,0.2)';
