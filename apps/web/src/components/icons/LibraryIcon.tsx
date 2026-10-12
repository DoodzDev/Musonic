/**
 * @file LibraryIcon.tsx
 * @description Web port of the mobile icon (same artwork). SVG library icon for the bottom tab navigator.
 * @author DoodzProg
 * @version 1.0.1
 * @license CC-BY-NC-4.0
 */

type Props = {
  size?: number;
  color?: string;
  filled?: boolean;
};

export function LibraryIcon({size = 24, color = 'currentColor', filled = false}: Props) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24">
      <path d="M3 22a1 1 0 0 1-1-1V3a1 1 0 0 1 2 0v18a1 1 0 0 1-1 1" fill={color} />
      <path d="M9 2a1 1 0 0 0-1 1v18a1 1 0 1 0 2 0V3a1 1 0 0 0-1-1" fill={color} />
      {filled ? (
        <path
          d="M15.5 2.134A1 1 0 0 0 14 3v18a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V6.464a1 1 0 0 0-.5-.866l-6-3.464"
          fill={color}
        />
      ) : (
        <path
          d="M15.5 2.134A1 1 0 0 0 14 3v18a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V6.464a1 1 0 0 0-.5-.866l-6-3.464"
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
