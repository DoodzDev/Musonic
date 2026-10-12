/**
 * @file ProfileIcon.tsx
 * @description Web port of the mobile icon (same artwork). SVG profile/user icon for the drawer header.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

type Props = {
  size?: number;
  color?: string;
};

export function ProfileIcon({size = 24, color = 'currentColor'}: Props) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24">
      <circle cx={12} cy={8} r={4.5} fill={color} />
      <path
        d="M3,21 C3,15.5 7.5,13 12,13 C16.5,13 21,15.5 21,21"
        fill={color}
      />
    </svg>
  );
}
