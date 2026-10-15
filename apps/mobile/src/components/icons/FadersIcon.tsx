/**
 * @file FadersIcon.tsx
 * @description Sort / filter: two faders.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Path} from 'react-native-svg';

type Props = {size?: number; color?: string};

export default function FadersIcon({size = 24, color = '#fff'}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 6 L10 6 M14 6 L20 6 M11 3 L11 9" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M4 18 L8 18 M12 18 L20 18 M9 15 L9 21" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
