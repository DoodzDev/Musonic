/**
 * @file GearIcon.tsx
 * @description Settings: a gear with eight teeth.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Circle, Path} from 'react-native-svg';

type Props = {size?: number; color?: string};

export default function GearIcon({size = 24, color = '#fff'}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M19.29 10.75 L21.94 10.90 L21.94 13.10 L19.29 13.25 L18.04 16.27 L19.80 18.25 L18.25 19.80 L16.27 18.04 L13.25 19.29 L13.10 21.94 L10.90 21.94 L10.75 19.29 L7.73 18.04 L5.75 19.80 L4.20 18.25 L5.96 16.27 L4.71 13.25 L2.06 13.10 L2.06 10.90 L4.71 10.75 L5.96 7.73 L4.20 5.75 L5.75 4.20 L7.73 5.96 L10.75 4.71 L10.90 2.06 L13.10 2.06 L13.25 4.71 L16.27 5.96 L18.25 4.20 L19.80 5.75 L18.04 7.73 Z" stroke={color} strokeWidth={2} strokeLinejoin="round" fill="none" />
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={2} fill="none" />
    </Svg>
  );
}
