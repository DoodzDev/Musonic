/**
 * @file ConnectContext.ts
 * @description What Musonic Connect (ADR-019) offers the rest of Musonic Web
 *   (filled by ConnectProvider, connect.tsx): the account's devices, what plays
 *   elsewhere, remote control, transfer and this browser's Connect settings.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

import { createContext, useContext, useEffect, useState } from 'react';
import { positionOf, type ConnectSnapshot, type RemotePlayer } from '@musonic/core';

export interface ConnectValue {
  /** This browser's device id. */
  me: string;
  snapshot: ConnectSnapshot;
  /** What plays on another device of the account (none when nothing plays elsewhere). */
  elsewhere: RemotePlayer | null;
  /** A command to the device playing elsewhere. */
  remote: (action: string, params?: unknown) => void;
  /** Playback moves to `device` (this one included), at the same second. */
  transfer: (device: string) => void;
  name: string;
  setName: (name: string) => void;
  alone: boolean;
  setAlone: (alone: boolean) => void;
  setSync: (sync: boolean) => void;
  /** The last command of this browser that did not reach its device. */
  failed: number;
}

export const ConnectContext = createContext<ConnectValue | null>(null);

/** Musonic Connect, or null without a Musonic Server. */
export function useConnect(): ConnectValue | null {
  return useContext(ConnectContext);
}


/** Where the device playing elsewhere is now, seconds, moving with it. */
export function useRemotePosition(player: RemotePlayer | null): number {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!player?.playing) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [player?.playing]);
  return player ? positionOf(player) / 1000 : 0;
}
