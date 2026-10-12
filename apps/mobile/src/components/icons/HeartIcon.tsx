/**
 * @file HeartIcon.tsx
 * @description SVG heart icon with filled/outline variants. Used for like/unlike
 *   actions; accent color when active.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Path} from 'react-native-svg';

type Props = {
  size?: number;
  color?: string;
  filled?: boolean;
};

export default function HeartIcon({size = 24, color = '#fff', filled = false}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
        fill={filled ? color : 'none'}
        stroke={filled ? 'none' : color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}