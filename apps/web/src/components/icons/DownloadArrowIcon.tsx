/**
 * @file DownloadArrowIcon.tsx
 * @description Web port of the mobile icon (same artwork). Bare download arrow over a baseline, without the circle of
 *   DownloadIcon. Sized for badges and other tight spots.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

type Props = {size?: number; color?: string};

export function DownloadArrowIcon({size = 24, color = 'currentColor'}: Props) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24">
      <path
        d="M12 3v12m-5-5 5 5 5-5M5 21h14"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
