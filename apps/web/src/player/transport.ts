/**
 * @file transport.ts
 * @description Player controls shared by every player view (see AudioEngine)
 *   and the keyboard shortcuts, usable from the main window and the mini player window.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { createContext, useContext } from 'react';
import type { PlayerContextValue } from './PlayerContext.tsx';

export interface Transport {
  /** Duration of the current track in seconds (0 when unknown). */
  duration: number;
  /** The current track could not be loaded. */
  failed: boolean;
  volume: number;
  muted: boolean;
  togglePlay: () => void;
  /** Previous track, or back to the start after 3 s (same rule as the mobile app). */
  previous: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
}

export const TransportContext = createContext<Transport | null>(null);

export function useTransport(): Transport {
  const value = useContext(TransportContext);
  if (!value) throw new Error('useTransport must be used inside AudioEngine');
  return value;
}

function isTyping(target: EventTarget | null): boolean {
  // `instanceof HTMLElement` fails for elements of the mini player window, which has its own globals.
  const el = target as HTMLElement | null;
  return !!el && typeof el.tagName === 'string' && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

/**
 * Space toggles playback, Ctrl+Arrows skip, unless the user is typing.
 * Shared by the main window and the mini player window.
 */
export function handleShortcut(event: KeyboardEvent, transport: Transport, player: PlayerContextValue): void {
  if (isTyping(event.target)) return;
  if (event.code === 'Space') {
    event.preventDefault();
    transport.togglePlay();
  } else if (event.ctrlKey && event.key === 'ArrowRight') {
    if (player.hasNext) player.next();
  } else if (event.ctrlKey && event.key === 'ArrowLeft') {
    transport.previous();
  }
}
