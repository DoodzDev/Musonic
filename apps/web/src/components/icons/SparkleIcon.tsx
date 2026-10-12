/**
 * @file SparkleIcon.tsx
 * @description Web port of the mobile icon (same artwork). Four-point sparkle, the "Magic" mark (Magic mixes, magic
 *   shuffle). Same star as the one drawn in the shuffle and track magic icons.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

type Props = {size?: number; color?: string};

const STAR =
  'M7.5 0 C7.5 0 7.0 3.5 5.3 5.3 C3.5 7.0 0 7.5 0 7.5 C0 7.5 3.5 8.0 5.3 9.7 C7.0 11.5 7.5 15 7.5 15 C7.5 15 8.0 11.5 9.7 9.7 C11.5 8.0 15 7.5 15 7.5 C15 7.5 11.5 7.0 9.7 5.3 C8.0 3.5 7.5 0 7.5 0 Z';

export function SparkleIcon({size = 24, color = 'currentColor'}: Props) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24">
      <path d={STAR} fill={color} transform="translate(2, 2) scale(1.333)" />
    </svg>
  );
}
