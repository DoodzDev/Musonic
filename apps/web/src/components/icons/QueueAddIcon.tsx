/**
 * @file QueueAddIcon.tsx
 * @description Web port of the mobile icon (same artwork). List with a plus sign. Used for "add to queue" actions.
 * @author DoodzProg
 * @version 1.0.1
 * @license CC-BY-NC-4.0
 */

type Props = {size?: number; color?: string};

export function QueueAddIcon({size = 24, color = '#B3B3B3'}: Props) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24">
      <path d="M3 6 H17" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <path d="M3 12 H13" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <path d="M3 18 H10" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <path d="M18 13 V21 M14 17 H22" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}
