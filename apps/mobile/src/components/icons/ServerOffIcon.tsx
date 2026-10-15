/**
 * @file ServerOffIcon.tsx
 * @description Server unreachable: a crossed-out server.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Path} from 'react-native-svg';

type Props = {size?: number; color?: string};

export default function ServerOffIcon({size = 24, color = '#fff'}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M2 3h20v6H2zM2 15h20v6H2z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M6 7h.01M6 19h.01" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M2 2l20 20" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
