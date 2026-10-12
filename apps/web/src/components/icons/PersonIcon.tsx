/**
 * @file PersonIcon.tsx
 * @description Web port of the mobile icon (same artwork). Person silhouette icon. Used for "go to artist" actions.
 * @author DoodzProg
 * @version 1.0.1
 * @license CC-BY-NC-4.0
 */

type Props = {size?: number; color?: string};

export function PersonIcon({size = 24, color = '#B3B3B3'}: Props) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24">
      <circle cx={12} cy={8} r={4} stroke={color} strokeWidth={2} fill="none" />
      <path
        d="M4 20 C4 16 7.6 13 12 13 C16.4 13 20 16 20 20"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
