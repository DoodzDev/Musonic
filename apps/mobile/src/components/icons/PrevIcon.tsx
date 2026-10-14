/**
 * @file PrevIcon.tsx
 * @description Skip-to-previous playback icon (Design v2): NextIcon mirrored.
 * @author DoodzProg
 * @version 2.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Path} from 'react-native-svg';
import {SKIP_PATH} from './NextIcon';

type Props = {size?: number; color?: string};

export default function PrevIcon({size = 32, color = '#fff'}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={SKIP_PATH} fill={color} transform="matrix(-1 0 0 1 24 0)" />
    </Svg>
  );
}
