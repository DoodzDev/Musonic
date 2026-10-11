/**
 * @file motion.ts
 * @description Design v2 motion presets for Reanimated. Every animation built
 *   with these follows the OS "Remove animations" setting: Reanimated's default
 *   `ReduceMotion.System` makes it jump straight to its final value.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {Easing, type WithSpringConfig, type WithTimingConfig} from 'react-native-reanimated';

/** Scale applied while a pressable is held down. */
export const PRESS_SCALE = 0.96;

export const timings = {
  press: {duration: 180, easing: Easing.out(Easing.cubic)},
} as const satisfies Record<string, WithTimingConfig>;

export const springs = {
  /**
   * Sheets and the full player: critically damped and clamped, so the panel
   * settles without bouncing past its edge (no gap opens underneath).
   */
  sheet: {damping: 28, stiffness: 200, overshootClamping: true},
  /** Cover shrinking on pause (1 ↔ 0.86). */
  cover: {damping: 14, stiffness: 160},
} as const satisfies Record<string, WithSpringConfig>;

/** Full player cover scale while paused. */
export const COVER_PAUSED_SCALE = 0.86;
