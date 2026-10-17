/**
 * @file QueueIcon.tsx
 * @description Web port of the mobile icon (same artwork). Play queue.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

type Props = {size?: number; color?: string};

export function QueueIcon({size = 22, color = 'currentColor'}: Props) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15V6" />
      <path d="M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
      <path d="M12 12H3M16 6H3M12 18H3" />
    </svg>
  );
}
