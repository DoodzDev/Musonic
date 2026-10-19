/**
 * @file PlayIcon.tsx
 * @description Web port of the mobile icon. Generic play triangle icon, with rounded corners on the web.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */

type Props = {size?: number; color?: string};

export function PlayIcon({size = 22, color = '#000'}: Props) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24">
      {/* Same triangle, corners rounded by a stroke of the fill colour: softer than sharp points. */}
      <path d="M7.5 5.2 L19.5 12 L7.5 18.8 Z" fill={color} stroke={color} strokeWidth={2.6} strokeLinejoin="round" />
    </svg>
  );
}
