/**
 * @file DownloadIcon.tsx
 * @description Web port of the mobile icon (same artwork). Circled download arrow icon.
 * @author DoodzProg
 * @version 1.0.1
 * @license CC-BY-NC-4.0
 */

type Props = {size?: number; color?: string};

export function DownloadIcon({size = 22, color = 'currentColor'}: Props) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24">
      <circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} fill="none" />
      <path
        d="M12 7 V14 M9 12 L12 15 L15 12"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
