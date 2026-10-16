/**
 * @file MinusCircleIcon.tsx
 * @description Remove: a minus in a circle. Outline (menus), or filled (grey by
 *   default, or `color`) with a white bar (edit lists).
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Circle, Path} from 'react-native-svg';

type Props = {size?: number; color?: string; filled?: boolean};

export default function MinusCircleIcon({size = 24, color, filled = false}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {filled ? (
        <>
          <Circle cx={12} cy={12} r={11} fill={color ?? '#555'} />
          <Path d="M7 12 H17" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" />
        </>
      ) : (
        <>
          <Circle cx={12} cy={12} r={10} stroke={color ?? '#fff'} strokeWidth={1.7} fill="none" />
          <Path d="M7 12 H17" stroke={color ?? '#fff'} strokeWidth={1.7} strokeLinecap="round" />
        </>
      )}
    </Svg>
  );
}
