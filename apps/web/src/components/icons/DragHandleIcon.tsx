/**
 * @file DragHandleIcon.tsx
 * @description Web port of the mobile icon (same artwork). Handle to drag a row.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

type Props = {size?: number; color?: string};

export function DragHandleIcon({size = 20, color = 'currentColor'}: Props) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24">
      <path d="M4 8h16M4 12h16M4 16h16" stroke={color} strokeWidth={2.2} strokeLinecap="round" fill="none" />
    </svg>
  );
}
