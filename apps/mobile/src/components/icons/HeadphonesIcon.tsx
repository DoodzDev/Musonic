/**
 * @file HeadphonesIcon.tsx
 * @description Headphones: a third-party player (device lists).
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Path, Rect} from 'react-native-svg';

type Props = {size?: number; color?: string};

export default function HeadphonesIcon({size = 24, color = '#fff'}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 18v-6a9 9 0 0 1 18 0v6" stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
      <Rect x={2} y={14} width={5} height={7} rx={2} fill={color} />
      <Rect x={17} y={14} width={5} height={7} rx={2} fill={color} />
    </Svg>
  );
}
