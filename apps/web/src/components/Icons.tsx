/**
 * @file Icons.tsx
 * @description Icons the mobile app does not have (volume, duration, password, logout, mini player, full screen), drawn in the same 2 px rounded style. Every other icon comes from components/icons/, ported from the mobile app.
 * @author DoodzProg
 * @version 0.4.0
 * @license CC-BY-NC-4.0
 */

interface IconProps {
  size?: number;
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function VolumeIcon({ size = 19, muted = false }: IconProps & { muted?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z" />
      {muted ? (
        <path d="m22 9-6 6M16 9l6 6" />
      ) : (
        <>
          <path d="M16 9a5 5 0 0 1 0 6" />
          <path d="M19.4 18.4a9 9 0 0 0 0-12.7" />
        </>
      )}
    </svg>
  );
}

export function ClockIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} strokeWidth={2.2} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function EyeIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function LogoutIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

/** Floating mini player: a window with a small filled one in its bottom right corner. */
export function MiniPlayerIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2.5" />
      <rect x="12" y="12" width="7" height="5" rx="1" fill="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

/** Full screen (four corners going out), or leaving it (`exit`, corners going in). */
export function FullscreenIcon({ size = 20, exit = false }: IconProps & { exit?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      {exit ? (
        <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
      ) : (
        <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
      )}
    </svg>
  );
}
