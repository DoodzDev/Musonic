/**
 * @file PauseIcon.tsx
 * @description Web port of the mobile icon (same artwork). Generic two-bar pause icon.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

type Props = {size?: number; color?: string};

export function PauseIcon({size = 22, color = 'currentColor'}: Props) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24">
      <rect x={5} y={4} width={4} height={16} rx={1.5} fill={color} />
      <rect x={15} y={4} width={4} height={16} rx={1.5} fill={color} />
    </svg>
  );
}
