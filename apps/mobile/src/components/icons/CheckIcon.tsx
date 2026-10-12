/**
 * @file CheckIcon.tsx
 * @description Bare check mark: confirms a completed action.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Path} from 'react-native-svg';

type Props = {size?: number; color?: string; strokeWidth?: number};

export default function CheckIcon({size = 24, color = '#fff', strokeWidth = 2}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M20 6 9 17l-5-5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
