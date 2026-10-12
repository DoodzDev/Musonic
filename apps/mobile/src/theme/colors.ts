/**
 * @file colors.ts
 * @description Legacy colour palette and dark theme object used by the
 *   current screens. New components use the Design v2 tokens (tokens.ts);
 *   this file goes away once every screen is rebuilt on them.
 *   The app accent colour is #FF6B35 (orange) — intentionally distinct from
 *   Spotify green.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
export const palette = {
  black: '#000000',
  white: '#FFFFFF',
  orange: '#FF6B35',
  orangeDark: '#CC5220',
  grey100: '#121212',
  grey200: '#1A1A1A',
  grey300: '#282828',
  grey400: '#3E3E3E',
  grey500: '#535353',
  grey600: '#B3B3B3',
  grey700: '#E0E0E0',
};

export type Theme = {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  accent: string;
  textPrimary: string;
  textSecondary: string;
  tabBar: string;
  tabBarBorder: string;
};

export const darkTheme: Theme = {
  background: palette.grey100,
  surface: palette.grey200,
  surfaceAlt: palette.grey300,
  border: palette.grey400,
  accent: palette.orange,
  textPrimary: palette.white,
  textSecondary: palette.grey600,
  tabBar: '#0A0A0A',
  tabBarBorder: palette.grey300,
};
