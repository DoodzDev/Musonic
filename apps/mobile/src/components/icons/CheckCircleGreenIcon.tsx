/**
 * @file CheckCircleGreenIcon.tsx
 * @description Green filled circle with a white checkmark. Used for "in playlist" /
 *   "saved" / "fully downloaded" states.
 * @author DoodzProg
 * @version 1.0.1
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Circle, Path} from 'react-native-svg';

type Props = {size?: number};

export default function CheckCircleGreenIcon({size = 24}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} fill="#1ED760" />
      <Path
        d="M7.5 12 L10.5 15 L16.5 9"
        stroke="white"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
