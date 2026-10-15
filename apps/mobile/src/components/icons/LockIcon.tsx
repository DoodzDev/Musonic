/**
 * @file LockIcon.tsx
 * @description Lock: a padlock (locked setting, e.g. rotation).
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Path, Rect} from 'react-native-svg';

type Props = {size?: number; color?: string};

export default function LockIcon({size = 24, color = '#fff'}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={5} y={11} width={14} height={10} rx={2} fill={color} />
      <Path d="M8 11 V7a4 4 0 0 1 8 0v4" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" />
    </Svg>
  );
}
