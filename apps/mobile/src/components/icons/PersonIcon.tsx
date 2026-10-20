/**
 * @file PersonIcon.tsx
 * @description Person silhouette icon. Used for "go to artist" actions; filled when its
 *   place is the current one (console menu).
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Circle, Path} from 'react-native-svg';

type Props = {size?: number; color?: string; filled?: boolean};

export default function PersonIcon({size = 24, color = '#B3B3B3', filled = false}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={8} r={4} stroke={color} strokeWidth={2} fill={filled ? color : 'none'} />
      <Path
        d="M4 20 C4 16 7.6 13 12 13 C16.4 13 20 16 20 20"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        fill={filled ? color : 'none'}
      />
    </Svg>
  );
}
