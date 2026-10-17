/**
 * @file PlusIcon.tsx
 * @description Web port of the mobile icon (same artwork). Plus sign (create, add).
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

type Props = {size?: number; color?: string; strokeWidth?: number};

export function PlusIcon({size = 24, color = 'currentColor', strokeWidth = 2}: Props) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" fill="none" />
    </svg>
  );
}
