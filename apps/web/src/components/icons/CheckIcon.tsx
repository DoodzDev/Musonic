/**
 * @file CheckIcon.tsx
 * @description Web port of the mobile icon (same artwork). Bare check mark: confirms a completed action.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

type Props = {size?: number; color?: string; strokeWidth?: number};

export function CheckIcon({size = 24, color = 'currentColor', strokeWidth = 2}: Props) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24">
      <path
        d="M20 6 9 17l-5-5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
