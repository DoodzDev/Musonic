/**
 * @file ImageIcon.tsx
 * @description Picture (change a cover): a frame with a sun and hills.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Circle, Path} from 'react-native-svg';

type Props = {size?: number; color?: string};

export default function ImageIcon({size = 24, color = '#fff'}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 5 C3 3.9 3.9 3 5 3 H19 C20.1 3 21 3.9 21 5 V19 C21 20.1 20.1 21 19 21 H5 C3.9 21 3 20.1 3 19 Z"
        stroke={color}
        strokeWidth={1.7}
      />
      <Circle cx={8.5} cy={8.5} r={1.5} fill={color} />
      <Path d="M3 15 L8 10 L12 14 L15 11 L21 17" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
