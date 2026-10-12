/**
 * @file HomeIcon.tsx
 * @description SVG home icon for the bottom tab navigator.
 * @author DoodzProg
 * @version 1.0.1
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Path} from 'react-native-svg';

type Props = {
  size?: number;
  color?: string;
  filled?: boolean;
};

const PATH =
  'M13.5 1.515a3 3 0 0 0-3 0L3 5.845a2 2 0 0 0-1 1.732V21a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-6h4v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7.577a2 2 0 0 0-1-1.732l-7.5-4.33z';

export default function HomeIcon({size = 24, color = '#fff', filled = false}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d={PATH}
        fill={filled ? color : 'none'}
        stroke={filled ? 'none' : color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}
