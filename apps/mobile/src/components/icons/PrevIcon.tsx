/**
 * @file PrevIcon.tsx
 * @description Skip-to-previous playback icon.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Path} from 'react-native-svg';

type Props = {size?: number; color?: string};

export default function PrevIcon({size = 32, color = '#fff'}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 4v16"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M5 12 L19 5 L19 19 Z"
        fill={color}
        stroke={color}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
