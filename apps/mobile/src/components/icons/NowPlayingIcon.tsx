/**
 * @file NowPlayingIcon.tsx
 * @description Now playing: four static level bars.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Path} from 'react-native-svg';

type Props = {size?: number; color?: string};

export default function NowPlayingIcon({size = 18, color = '#fff'}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 18 V10 M8 18 V4 M13 18 V8 M18 18 V14" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
    </Svg>
  );
}
