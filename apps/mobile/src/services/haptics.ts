/**
 * @file haptics.ts
 * @description Design v2 haptic feedback. One light, semantic call per kind of
 *   action so the whole app feels the same. Silent when the user turned
 *   haptics off in Musonic; still plays on silent and Do Not Disturb, like
 *   Android's own touch feedback. Silent too for actions coming from the car
 *   (Android Auto): the phone is not in the user's hand.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import {trigger, type HapticFeedbackTypes} from 'react-native-haptic-feedback';
import {useSettingsStore} from '../store/settingsStore';

export type HapticKind = 'light' | 'selection' | 'success' | 'warning';

const FEEDBACK: Record<HapticKind, keyof typeof HapticFeedbackTypes> = {
  /** Play, pause, skip. */
  light: 'impactLight',
  /** Picking a chip, tab or option. */
  selection: 'selection',
  /** Like, add to playlist, download done. */
  success: 'notificationSuccess',
  /** Before a destructive action (delete, remove). */
  warning: 'notificationWarning',
};

/**
 * The library skips every haptic while the phone is on silent or Do Not
 * Disturb. Android's own touch feedback (keyboard, system UI) still plays
 * then, so Musonic does the same: its own setting decides instead.
 */
const HAPTIC_OPTIONS = {ignoreAndroidSystemSettings: true};

let muted = 0;

export function haptic(kind: HapticKind): void {
  if (muted > 0 || !useSettingsStore.getState().hapticsEnabled) return;
  trigger(FEEDBACK[kind], HAPTIC_OPTIONS);
}

/** Runs `action` without haptics (its synchronous part, where actions give their feedback). */
export function withoutHaptics<T>(action: () => T): T {
  muted++;
  try {
    return action();
  } finally {
    muted--;
  }
}
