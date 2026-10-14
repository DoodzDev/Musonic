/**
 * @file PlusIcon.tsx
 * @description Plain plus sign (add to a playlist, create…).
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Path} from 'react-native-svg';

type Props = {size?: number; color?: string; strokeWidth?: number};

export default function PlusIcon({size = 24, color = '#fff', strokeWidth = 2}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" fill="none" />
    </Svg>
  );
}
