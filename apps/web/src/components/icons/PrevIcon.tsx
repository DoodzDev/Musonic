/**
 * @file PrevIcon.tsx
 * @description Web port of the mobile icon (same artwork). Skip-to-previous playback icon.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

type Props = {size?: number; color?: string};

export function PrevIcon({size = 32, color = 'currentColor'}: Props) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M5 4v16"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 12 L19 5 L19 19 Z"
        fill={color}
        stroke={color}
        strokeLinejoin="round"
      />
    </svg>
  );
}
