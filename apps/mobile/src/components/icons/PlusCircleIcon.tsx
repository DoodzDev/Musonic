/**
 * @file PlusCircleIcon.tsx
 * @description Outlined circle with a plus sign. Used for add-to-library actions.
 * @author DoodzProg
 * @version 1.0.1
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Circle, Path} from 'react-native-svg';

type Props = {size?: number; color?: string};

export default function PlusCircleIcon({size = 26, color = '#fff'}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={2} fill="none" />
      <Path
        d="M12 7.5 L12 16.5 M7.5 12 L16.5 12"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}
