/**
 * @file CheckCircleGreenIcon.tsx
 * @description Web port of the mobile icon (same artwork). Green filled circle with a white checkmark. Used for "in playlist" /
 *   "saved" / "fully downloaded" states.
 * @author DoodzProg
 * @version 1.0.1
 * @license CC-BY-NC-4.0
 */

type Props = {size?: number};

export function CheckCircleGreenIcon({size = 24}: Props) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24">
      <circle cx={12} cy={12} r={10} fill="#1ED760" />
      <path
        d="M7.5 12 L10.5 15 L16.5 9"
        stroke="white"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
