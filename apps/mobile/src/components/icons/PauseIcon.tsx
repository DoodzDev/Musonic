/**
 * @file PauseIcon.tsx
 * @description Generic two-bar pause icon.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Rect} from 'react-native-svg';

type Props = {size?: number; color?: string};

export default function PauseIcon({size = 22, color = '#fff'}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={5} y={4} width={4} height={16} rx={1.5} fill={color} />
      <Rect x={15} y={4} width={4} height={16} rx={1.5} fill={color} />
    </Svg>
  );
}
