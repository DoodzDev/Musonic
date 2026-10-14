/**
 * @file DragHandleIcon.tsx
 * @description Three-line drag handle of reorderable rows (queue, playlist edit).
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Path} from 'react-native-svg';

type Props = {size?: number; color?: string};

export default function DragHandleIcon({size = 20, color = 'rgba(255,255,255,0.45)'}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 8h16M4 12h16M4 16h16" stroke={color} strokeWidth={2.2} strokeLinecap="round" fill="none" />
    </Svg>
  );
}
