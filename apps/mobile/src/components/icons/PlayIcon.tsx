/**
 * @file PlayIcon.tsx
 * @description Play triangle with rounded corners (Design v2), the same glyph
 *   everywhere.
 * @author DoodzProg
 * @version 2.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Path} from 'react-native-svg';

type Props = {size?: number; color?: string};

export default function PlayIcon({size = 22, color = '#000'}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 3.8v16.4a1.1 1.1 0 0 0 1.7.94l13.4-8.2a1.1 1.1 0 0 0 0-1.88L7.7 2.86A1.1 1.1 0 0 0 6 3.8z" fill={color} />
    </Svg>
  );
}
