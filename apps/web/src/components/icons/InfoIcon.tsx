/**
 * @file InfoIcon.tsx
 * @description Circled "i": opens the explanation of a setting.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

type Props = {size?: number; color?: string};

export function InfoIcon({size = 16, color = 'currentColor'}: Props) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9.5" stroke={color} strokeWidth={1.8} />
      <path d="M12 11v6M12 7.5h.01" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    </svg>
  );
}
