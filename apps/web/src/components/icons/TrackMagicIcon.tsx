/**
 * @file TrackMagicIcon.tsx
 * @description Web port of the mobile icon (same artwork). Square badge with two star cut-outs, marks Magic tracks.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

import { useId } from 'react';
import { colors } from '../../theme/tokens.ts';

type Props = {
  size?: number;
  color?: string;
};

const STAR = 'M7.5 0 C7.5 0 7.0 3.5 5.3 5.3 C3.5 7.0 0 7.5 0 7.5 C0 7.5 3.5 8.0 5.3 9.7 C7.0 11.5 7.5 15 7.5 15 C7.5 15 8.0 11.5 9.7 9.7 C11.5 8.0 15 7.5 15 7.5 C15 7.5 11.5 7.0 9.7 5.3 C8.0 3.5 7.5 0 7.5 0 Z';

export function TrackMagicIcon({ size = 14, color }: Props) {
  // Each instance needs its own mask id inside the page.
  const maskId = useId();
  const col = color ?? colors.accent;
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24">
      <defs>
        <mask id={maskId}>
          <rect x={2} y={2} width={20} height={20} rx={3} fill="white" />
          <path d={STAR} fill="black" transform="translate(9.5, 14.5) scale(0.8) translate(-7.5, -7.5)" />
          <path d={STAR} fill="black" transform="translate(16, 8) scale(0.5) translate(-7.5, -7.5)" />
        </mask>
      </defs>
      <path d="M0 0h24v24H0z" fill={col} mask={`url(#${maskId})`} />
    </svg>
  );
}
