/**
 * @file DiscIcon.tsx
 * @description Album: a disc.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Circle} from 'react-native-svg';

type Props = {size?: number; color?: string};

export default function DiscIcon({size = 24, color = '#fff'}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={1.7} fill="none" />
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={1.7} fill="none" />
      <Circle cx={12} cy={12} r={1} fill={color} />
    </Svg>
  );
}
