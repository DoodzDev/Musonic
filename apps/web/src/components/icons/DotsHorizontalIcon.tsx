/**
 * @file DotsHorizontalIcon.tsx
 * @description Web port of the mobile icon (same artwork). Three horizontal dots (ellipsis / more options) icon.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

type Props = {size?: number; color?: string};

export function DotsHorizontalIcon({size = 24, color = 'currentColor'}: Props) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24">
      <circle cx={5} cy={12} r={1.8} fill={color} />
      <circle cx={12} cy={12} r={1.8} fill={color} />
      <circle cx={19} cy={12} r={1.8} fill={color} />
    </svg>
  );
}
