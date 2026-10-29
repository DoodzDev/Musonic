/**
 * @file useConnect.ts
 * @description The screens' view of Musonic Connect (ADR-019): the account's
 *   devices, and the remote mode: while another device plays and the phone
 *   does not, the mini player and the full player show that device's track and
 *   position (moving with it) and their buttons control it.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import {useEffect, useMemo, useState, useSyncExternalStore} from 'react';
import {positionOf} from '@musonic/core/connect';
import {State, usePlaybackState} from '../player';
import {connectSnapshot, elsewhereNow, sendConnectCommand, subscribeConnect} from './connectService';

export function useConnectSnapshot() {
  return useSyncExternalStore(
    listener => subscribeConnect(listener),
    connectSnapshot,
  );
}

export type RemoteTrack = {id: string; title: string; artist: string; album: string; coverArt?: string; artwork?: string; duration: number};

export type RemotePlayback = {
  track: RemoteTrack;
  playing: boolean;
  /** Seconds, moving with the device. */
  position: number;
  device: {name: string; kind: string};
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  skipBy: (seconds: number) => void;
};

/** The device playing elsewhere to show and control, or null (the phone shows its own). */
export function useRemotePlayback(): RemotePlayback | null {
  const snapshot = useConnectSnapshot();
  const {state} = usePlaybackState();
  const here = state === State.Playing;
  // Synced playback off: each device plays on its own, no remote mode.
  const remote = here || !snapshot.sync ? null : elsewhereNow(snapshot);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!remote?.playing) return;
    const id = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, [remote?.playing]);
  const position = remote ? positionOf(remote) / 1000 : 0;

  return useMemo(() => {
    if (!remote?.track) return null;
    const to = remote.device;
    const device = snapshot.devices.find(d => d.id === to);
    return {
      track: {
        id: remote.track,
        title: remote.title ?? '',
        artist: remote.artist ?? '',
        album: remote.album ?? '',
        coverArt: remote.coverArt ?? undefined,
        duration: remote.duration ?? 0,
      },
      playing: remote.playing,
      position,
      device: {name: device?.name ?? '', kind: device?.kind ?? 'web'},
      toggle: () => sendConnectCommand(to, remote.playing ? 'pause' : 'play'),
      next: () => sendConnectCommand(to, 'next'),
      previous: () => sendConnectCommand(to, 'previous'),
      seek: seconds => sendConnectCommand(to, 'seek', {position: Math.round(seconds * 1000)}),
      skipBy: seconds => sendConnectCommand(to, 'seek', {position: Math.max(0, Math.round((position + seconds) * 1000))}),
    };
  }, [remote, snapshot.devices, position]);
}
