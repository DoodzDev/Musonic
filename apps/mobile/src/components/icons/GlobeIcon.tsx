/**
 * @file GlobeIcon.tsx
 * @description Globe: the web, a public address.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Path, Circle} from 'react-native-svg';

type Props = {size?: number; color?: string};

export default function GlobeIcon({size = 24, color = '#fff'}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} fill="none" />
      <Path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" stroke={color} strokeWidth={2} fill="none" />
    </Svg>
  );
}
