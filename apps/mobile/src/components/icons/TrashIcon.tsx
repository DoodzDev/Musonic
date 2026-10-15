/**
 * @file TrashIcon.tsx
 * @description Delete: a trash can.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Path} from 'react-native-svg';

type Props = {size?: number; color?: string};

export default function TrashIcon({size = 24, color = '#fff'}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 6 H21 M8 6 V4 C8 3.4 8.4 3 9 3 H15 C15.6 3 16 3.4 16 4 V6 M19 6 L18 20 C18 20.6 17.6 21 17 21 H7 C6.4 21 6 20.6 6 20 L5 6"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M10 11 V17 M14 11 V17" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
    </Svg>
  );
}
