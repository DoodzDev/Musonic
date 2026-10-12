/**
 * @file useIsLandscape.ts
 * @description Single source of truth for orientation detection. Wraps
 *   useWindowDimensions so screens don't each reimplement the width>height check.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {useWindowDimensions} from 'react-native';

export function useIsLandscape(): boolean {
  const {width, height} = useWindowDimensions();
  return width > height;
}
