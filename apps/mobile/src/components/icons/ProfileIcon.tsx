/**
 * @file ProfileIcon.tsx
 * @description SVG profile/user icon for the drawer header.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Circle, Path} from 'react-native-svg';

type Props = {
  size?: number;
  color?: string;
};

export default function ProfileIcon({size = 24, color = '#fff'}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={8} r={4.5} fill={color} />
      <Path
        d="M3,21 C3,15.5 7.5,13 12,13 C16.5,13 21,15.5 21,21"
        fill={color}
      />
    </Svg>
  );
}
