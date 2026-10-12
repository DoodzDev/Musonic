/**
 * @file DotsVerticalIcon.tsx
 * @description Three vertical dots (contextual menu) icon.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Circle} from 'react-native-svg';

type Props = {size?: number; color?: string};

export default function DotsVerticalIcon({size = 18, color = '#888'}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={5} r={1.8} fill={color} />
      <Circle cx={12} cy={12} r={1.8} fill={color} />
      <Circle cx={12} cy={19} r={1.8} fill={color} />
    </Svg>
  );
}
