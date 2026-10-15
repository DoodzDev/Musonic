/**
 * @file PinIcon.tsx
 * @description Pin (pinned playlists): outline, or filled once pinned.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Path} from 'react-native-svg';

type Props = {size?: number; color?: string; filled?: boolean};

export default function PinIcon({size = 24, color = '#fff', filled = false}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M9 2 L15 2 L15 8 L18 11 L13.5 11 L13.5 21 L12 22 L10.5 21 L10.5 11 L6 11 L9 8 Z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
        fill={filled ? color : 'none'}
        // Rotated, the pin sits 1 unit high in its box: recentred.
        transform="translate(0, 1) rotate(45, 12, 12)"
      />
    </Svg>
  );
}
