/**
 * @file RemoteControl.tsx
 * @description Musonic Connect (ADR-019), like Spotify Web: while another
 *   device of the account plays and this one does not, the player bar and the
 *   full player show that device's track and position, and their buttons,
 *   progress bar and volume send it commands instead of playing here. Done by
 *   giving those components a player and a transport of their own; the rest of
 *   the app keeps the local ones.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

import { useMemo, type ReactNode } from 'react';
import type { Song } from '@musonic/core';
import { useConnect, useRemotePosition } from './ConnectContext.ts';
import { PlayerContext, usePlayer, type PlayerContextValue, type WebTrack } from './PlayerContext.tsx';
import { TransportContext, useTransport, type Transport } from './transport.ts';

export function RemoteControl({ children }: { children: ReactNode }) {
  const connect = useConnect();
  const player = usePlayer();
  const transport = useTransport();
  const remote = connect?.elsewhere ?? null;
  const position = useRemotePosition(remote);

  const overrides = useMemo(() => {
    if (!connect || !remote?.track) return null;
    const send = connect.remote;
    const device = connect.snapshot.devices.find((d) => d.id === remote.device);
    const song = {
      id: remote.track,
      entryId: `remote:${remote.track}`,
      title: remote.title ?? '',
      artist: remote.artist,
      album: remote.album,
      coverArt: remote.coverArt,
      duration: remote.duration,
    } as unknown as WebTrack & Song;
    const remotePlayer: PlayerContextValue = {
      ...player,
      current: song,
      playing: remote.playing,
      hasNext: true,
      next: () => send('next'),
      modes: {
        ...player.modes,
        shuffle: (remote.shuffle as PlayerContextValue['modes']['shuffle']) ?? player.modes.shuffle,
        repeat: (remote.repeat as PlayerContextValue['modes']['repeat']) ?? player.modes.repeat,
      },
    };
    const volume = (remote.volume ?? Math.round(transport.volume * 100)) / 100;
    const remoteTransport: Transport = {
      ...transport,
      duration: remote.duration ?? 0,
      failed: false,
      volume,
      muted: volume === 0,
      togglePlay: () => send(remote.playing ? 'pause' : 'play'),
      previous: () => send('previous'),
      seek: (seconds) => send('seek', { position: Math.round(seconds * 1000) }),
      setVolume: (v) => send('volume', { volume: Math.round(v * 100) }),
      setMuted: (muted) => send('volume', { volume: muted ? 0 : 50 }),
      skipBy: (seconds) => send('seek', { position: Math.max(0, Math.round((position + seconds) * 1000)) }),
      position,
      remoteDevice: device ? { name: device.name, kind: device.kind } : { name: '', kind: 'web' },
    };
    return { remotePlayer, remoteTransport };
  }, [connect, remote, player, transport, position]);

  if (!overrides) return <>{children}</>;
  return (
    <PlayerContext.Provider value={overrides.remotePlayer}>
      <TransportContext.Provider value={overrides.remoteTransport}>{children}</TransportContext.Provider>
    </PlayerContext.Provider>
  );
}
