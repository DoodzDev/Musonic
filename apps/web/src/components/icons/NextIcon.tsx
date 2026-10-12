/**
 * @file NextIcon.tsx
 * @description Web port of the mobile icon (same artwork). Skip-to-next playback icon.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

type Props = {size?: number; color?: string};

export function NextIcon({size = 32, color = 'currentColor'}: Props) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M19 4v16"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 12 L5 5 L5 19 Z"
        fill={color}
        stroke={color}
        strokeLinejoin="round"
      />
    </svg>
  );
}
