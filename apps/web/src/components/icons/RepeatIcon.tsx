/**
 * @file RepeatIcon.tsx
 * @description Web port of the mobile icon (same artwork). Repeat none / all / one (with a "1").
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

import { colors } from '../../theme/tokens.ts';

type Props = {
  mode?: 'none' | 'all' | 'one';
  color?: string;
  size?: number;
};

export function RepeatIcon({ mode = 'none', color, size = 22 }: Props) {
  const active = mode !== 'none';
  const col = color ?? (active ? colors.accent : colors.iconInactive);
  return (
    <span className="icon-mode">
      <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24">
        <path d="m17 2 4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14" stroke={col} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="m7 22-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3" stroke={col} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        {mode === 'one' && <path d="M11 10h1v4" stroke={col} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />}
      </svg>
      {active && color === undefined && <span className="icon-dot" />}
    </span>
  );
}
