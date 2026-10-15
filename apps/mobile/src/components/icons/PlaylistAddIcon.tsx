/**
 * @file PlaylistAddIcon.tsx
 * @description Add to a playlist: three lines and a plus.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Path} from 'react-native-svg';

type Props = {size?: number; color?: string};

export default function PlaylistAddIcon({size = 24, color = '#fff'}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 5 H15 M3 11 H13 M3 17 H10" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M17 11 V19 M13 15 H21" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}
