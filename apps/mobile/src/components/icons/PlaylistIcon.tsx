/**
 * @file PlaylistIcon.tsx
 * @description Playlist: three lines, the last one shorter (placeholder cover).
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Path} from 'react-native-svg';

type Props = {size?: number; color?: string};

export default function PlaylistIcon({size = 24, color = '#fff'}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 6 H21 M3 12 H21 M3 18 H15" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}
