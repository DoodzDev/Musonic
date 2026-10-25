/**
 * @file MinusCircleIcon.tsx
 * @description Web port of the mobile icon (same artwork). Remove a row.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

type Props = {size?: number; color?: string};

export function MinusCircleIcon({size = 20, color = 'currentColor'}: Props) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24">
      <circle cx={12} cy={12} r={10} stroke={color} strokeWidth={1.7} fill="none" />
      <path d="M7 12 H17" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
    </svg>
  );
}
