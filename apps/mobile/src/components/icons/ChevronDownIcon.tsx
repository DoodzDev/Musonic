/**
 * @file ChevronDownIcon.tsx
 * @description Chevron pointing downward. Used for close/collapse actions.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Path} from 'react-native-svg';

type Props = {size?: number; color?: string};

export default function ChevronDownIcon({size = 24, color = '#fff'}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="m6 9 6 6 6-6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
