/**
 * @file SelectCircleIcon.tsx
 * @description Selection circle of multi-select lists: an empty ring, or an
 *   accent disc with a check mark once selected.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Circle, Path} from 'react-native-svg';
import {colors} from '../../theme/tokens';

type Props = {selected: boolean; size?: number};

export default function SelectCircleIcon({selected, size = 24}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {selected ? (
        <>
          <Circle cx={12} cy={12} r={12} fill={colors.accent} />
          <Path d="M7 12.5l3.5 3.5L17.5 8.5" stroke={colors.onAccent} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      ) : (
        <Circle cx={12} cy={12} r={11.25} stroke="rgba(255,255,255,0.45)" strokeWidth={1.5} fill="none" />
      )}
    </Svg>
  );
}
