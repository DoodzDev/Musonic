/**
 * @file PlusCircleIcon.tsx
 * @description Web port of the mobile icon (same artwork). Outlined circle with a plus sign. Used for add-to-library actions.
 * @author DoodzProg
 * @version 1.0.1
 * @license CC-BY-NC-4.0
 */

type Props = {size?: number; color?: string};

export function PlusCircleIcon({size = 26, color = 'currentColor'}: Props) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24">
      <circle cx={12} cy={12} r={10} stroke={color} strokeWidth={2} fill="none" />
      <path
        d="M12 7.5 L12 16.5 M7.5 12 L16.5 12"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
