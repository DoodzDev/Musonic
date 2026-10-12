/**
 * @file TrackMagicIcon.tsx
 * @description Rounded square with two star cutouts — displayed inline on
 *   magic-inserted queue tracks.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import Svg, {Defs, Mask, Path, Rect} from 'react-native-svg';
import {darkTheme} from '../../theme';

type Props = {
  size?: number;
  color?: string;
};

const STAR =
  'M7.5 0 C7.5 0 7.0 3.5 5.3 5.3 C3.5 7.0 0 7.5 0 7.5 C0 7.5 3.5 8.0 5.3 9.7 C7.0 11.5 7.5 15 7.5 15 C7.5 15 8.0 11.5 9.7 9.7 C11.5 8.0 15 7.5 15 7.5 C15 7.5 11.5 7.0 9.7 5.3 C8.0 3.5 7.5 0 7.5 0 Z';

export default function TrackMagicIcon({size = 14, color}: Props) {
  const col = color ?? darkTheme.accent;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <Mask id="track-magic-mask">
          <Rect x={2} y={2} width={20} height={20} rx={3} fill="white" />
          {/* Large star cutout — bottom-left */}
          <Path
            d={STAR}
            fill="black"
            transform="translate(9.5, 14.5) scale(0.8) translate(-7.5, -7.5)"
          />
          {/* Small star cutout — top-right */}
          <Path
            d={STAR}
            fill="black"
            transform="translate(16, 8) scale(0.5) translate(-7.5, -7.5)"
          />
        </Mask>
      </Defs>
      <Path
        d="M0 0h24v24H0z"
        fill={col}
        mask="url(#track-magic-mask)"
      />
    </Svg>
  );
}
