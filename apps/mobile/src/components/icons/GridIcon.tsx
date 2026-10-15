/**
 * @file GridIcon.tsx
 * @description Grid view: four rounded squares.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Rect} from 'react-native-svg';

type Props = {size?: number; color?: string};

export default function GridIcon({size = 24, color = '#fff'}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={2} y={2} width={9} height={9} rx={1.5} fill={color} />
      <Rect x={13} y={2} width={9} height={9} rx={1.5} fill={color} />
      <Rect x={2} y={13} width={9} height={9} rx={1.5} fill={color} />
      <Rect x={13} y={13} width={9} height={9} rx={1.5} fill={color} />
    </Svg>
  );
}
