/**
 * @file ListIcon.tsx
 * @description List view: three bulleted lines.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Circle, Path} from 'react-native-svg';

type Props = {size?: number; color?: string};

export default function ListIcon({size = 24, color = '#fff'}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={3.5} cy={6} r={1.8} fill={color} />
      <Circle cx={3.5} cy={12} r={1.8} fill={color} />
      <Circle cx={3.5} cy={18} r={1.8} fill={color} />
      <Path d="M7 6 H21 M7 12 H21 M7 18 H21" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
