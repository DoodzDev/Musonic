/**
 * @file QueueAddIcon.tsx
 * @description List with a plus sign. Used for "add to queue" actions.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Path} from 'react-native-svg';

type Props = {size?: number; color?: string};

export default function QueueAddIcon({size = 24, color = '#B3B3B3'}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 4.5 H17" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M3 10.5 H13" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M3 16.5 H10" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M18 11.5 V19.5 M14 15.5 H22" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
