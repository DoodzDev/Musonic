/**
 * @file MusicNoteIcon.tsx
 * @description Music: two beamed notes (the "My music" cover).
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Circle, Path} from 'react-native-svg';

type Props = {size?: number; color?: string};

export default function MusicNoteIcon({size = 24, color = '#fff'}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 18V5l12-2v13" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={6} cy={18} r={3} stroke={color} strokeWidth={1.8} />
      <Circle cx={18} cy={16} r={3} stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}
