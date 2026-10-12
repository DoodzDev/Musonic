/**
 * @file PlayIcon.tsx
 * @description Generic play triangle icon.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Path} from 'react-native-svg';

type Props = {size?: number; color?: string};

export default function PlayIcon({size = 22, color = '#000'}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M7 4 L21 12 L7 20 Z" fill={color} />
    </Svg>
  );
}
