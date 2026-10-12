/**
 * @file AlertIcon.tsx
 * @description Web port of the mobile icon (same artwork). Exclamation mark, bare or inside a triangle: signals a failed
 *   action or a warning.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

type Props = {size?: number; color?: string; strokeWidth?: number; triangle?: boolean};

export function AlertIcon({size = 24, color = 'currentColor', strokeWidth = 2, triangle = false}: Props) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24">
      {triangle ? (
        <path
          d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          fill="none"
        />
      ) : null}
      <path
        d={triangle ? 'M12 9v4M12 17h.01' : 'M12 6v8M12 18.5h.01'}
        stroke={color}
        strokeWidth={triangle ? strokeWidth : strokeWidth + 0.6}
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
