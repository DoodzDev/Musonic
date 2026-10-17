/**
 * @file MusicNoteIcon.tsx
 * @description Web port of the mobile icon (same artwork). Music note (My Music).
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

type Props = {size?: number; color?: string};

export function MusicNoteIcon({size = 24, color = 'currentColor'}: Props) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M9 18V5l12-2v13" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={6} cy={18} r={3} stroke={color} strokeWidth={1.8} />
      <circle cx={18} cy={16} r={3} stroke={color} strokeWidth={1.8} />
    </svg>
  );
}
