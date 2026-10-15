/**
 * @file PencilIcon.tsx
 * @description Edit: a pencil over a square.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Path} from 'react-native-svg';

type Props = {size?: number; color?: string; strokeWidth?: number};

export default function PencilIcon({size = 24, color = '#fff', strokeWidth = 1.8}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M11 5 H5 C4.4 5 4 5.4 4 6 V19 C4 19.6 4.4 20 5 20 H18 C18.6 20 19 19.6 19 19 V13 M17.5 2.5 C18.3 1.7 19.7 1.7 20.5 2.5 C21.3 3.3 21.3 4.7 20.5 5.5 L12 14 L8 15 L9 11 Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        // The drawing sits 1 unit high in its box: recentred.
        transform="translate(0, 1)"
      />
    </Svg>
  );
}
