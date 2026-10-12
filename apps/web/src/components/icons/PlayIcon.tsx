/**
 * @file PlayIcon.tsx
 * @description Web port of the mobile icon (same artwork). Generic play triangle icon.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

type Props = {size?: number; color?: string};

export function PlayIcon({size = 22, color = '#000'}: Props) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24">
      <path d="M7 4 L21 12 L7 20 Z" fill={color} />
    </svg>
  );
}
