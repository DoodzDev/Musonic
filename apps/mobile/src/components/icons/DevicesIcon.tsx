/**
 * @file DevicesIcon.tsx
 * @description Devices: a tablet with a phone in front (Musonic Connect, « Listen on »).
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Path, Rect} from 'react-native-svg';

type Props = {size?: number; color?: string};

export default function DevicesIcon({size = 24, color = '#fff'}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M10 19H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Rect x={13} y={10} width={8} height={11} rx={2} stroke={color} strokeWidth={2} fill="none" />
      <Path d="M16.5 18h1" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
