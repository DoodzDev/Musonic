/**
 * @file PhoneIcon.tsx
 * @description Phone: a device of the phone kind (device lists).
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Path, Rect} from 'react-native-svg';

type Props = {size?: number; color?: string};

export default function PhoneIcon({size = 24, color = '#fff'}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={6} y={2} width={12} height={20} rx={3} stroke={color} strokeWidth={2} fill="none" />
      <Path d="M11 18h2" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
