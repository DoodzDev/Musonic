/**
 * @file PauseIcon.tsx
 * @description Two-bar pause icon with rounded bars (Design v2), the same glyph
 *   everywhere.
 * @author DoodzProg
 * @version 2.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Rect} from 'react-native-svg';

type Props = {size?: number; color?: string};

export default function PauseIcon({size = 22, color = '#fff'}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={5.5} y={3.5} width={4.6} height={17} rx={1.4} fill={color} />
      <Rect x={13.9} y={3.5} width={4.6} height={17} rx={1.4} fill={color} />
    </Svg>
  );
}
