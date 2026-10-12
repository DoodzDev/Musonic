/**
 * @file DownloadIcon.tsx
 * @description Circled download arrow icon.
 * @author DoodzProg
 * @version 1.0.1
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Circle, Path} from 'react-native-svg';

type Props = {size?: number; color?: string};

export default function DownloadIcon({size = 22, color = '#fff'}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} fill="none" />
      <Path
        d="M12 7 V14 M9 12 L12 15 L15 12"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
