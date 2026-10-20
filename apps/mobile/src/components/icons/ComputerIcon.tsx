/**
 * @file ComputerIcon.tsx
 * @description Computer: a device of the desktop or browser kind (device lists).
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Path, Rect} from 'react-native-svg';

type Props = {size?: number; color?: string};

export default function ComputerIcon({size = 24, color = '#fff'}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={2} y={4} width={20} height={13} rx={2} stroke={color} strokeWidth={2} fill="none" />
      <Path d="M8 21h8M12 17v4" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
