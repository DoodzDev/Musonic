/**
 * @file BackArrowIcon.tsx
 * @description Web port of the mobile icon (same artwork). The single "go back" chevron used everywhere in the app — every
 *   screen that needs a back button imports this instead of defining its own,
 *   so the icon stays visually identical across the whole app (was previously
 *   inconsistent: some screens used a full arrow, others a bare chevron).
 * @author DoodzProg
 * @version 1.1.1
 * @license CC-BY-NC-4.0
 */

type Props = {size?: number; color?: string};

export function BackArrowIcon({size = 24, color = 'currentColor'}: Props) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24">
      <path
        d="m15 19-7-7 7-7"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
