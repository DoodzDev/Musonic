/**
 * @file mode.ts
 * @description Which player the app uses (ADR-022): react-native-track-player,
 *   or the native Media3 player while it is being tested. Read once at launch;
 *   a change applies at the next launch of the app.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {Platform} from 'react-native';
import {storage} from '../../store/storage';

const NATIVE_PLAYER_KEY = 'player.native';

function savedChoice(): boolean {
  try {
    return storage.getBoolean(NATIVE_PLAYER_KEY) === true;
  } catch {
    return false;
  }
}

/** The native player is used for this run of the app (Android only). */
export const usesNativePlayer: boolean = Platform.OS === 'android' && savedChoice();

/** The choice saved for the next launch. */
export function nativePlayerChosen(): boolean {
  return savedChoice();
}

export function chooseNativePlayer(on: boolean): void {
  storage.set(NATIVE_PLAYER_KEY, on);
}
