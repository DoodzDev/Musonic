/**
 * @file connect.tsx
 * @description Musonic Connect in Musonic Web (ADR-019), on a Musonic Server:
 *   this browser registers as a device, says what it plays when that changes,
 *   obeys the commands sent to it, pauses when another device of the account
 *   starts (synced playback), and offers the rest of the app the account's
 *   devices, what plays elsewhere, remote control and transfer (« Listen on »).
 *   Its name and « plays alone » are kept in this browser.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ConnectClient,
  activeElsewhere,
  positionOf,
  shouldYield,
  type Command,
  type ConnectSnapshot,
  type PlayerUpdate,
  type Song,
} from '@musonic/core';
import { upcomingOrder } from '@musonic/core/playback';
import { useApp } from '../context/AppContext.tsx';
import { liveAccess, useMusonicServer, v1 } from '../lib/musonicApi.ts';
import { usePlayer, type PlayerContextValue } from './PlayerContext.tsx';
import { currentPosition, setStartAt, setStartPaused, subscribePosition } from './position.ts';
import { useTransport, type Transport } from './transport.ts';
import { ConnectContext, type ConnectValue } from './ConnectContext.ts';

const ID_KEY = 'musonic.connect.device';
const NAME_KEY = 'musonic.connect.name';
const ALONE_KEY = 'musonic.connect.alone';
/** Tracks sent with a state: enough to take over a queue, light enough to send at each change. */
const QUEUE_SENT = 100;

/** What a transfer carries: the queue from the track playing, and where it was. */
type Handover = { tracks: Song[]; position: number; sourceId: string | null };

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Kept for this visit only.
  }
}

/** One device per tab (two tabs can play different things): kept by the tab, across reloads. */
function deviceId(): string {
  let id: string | null = null;
  try {
    id = sessionStorage.getItem(ID_KEY);
  } catch {
    // A new id for this visit.
  }
  if (!id) {
    id = `web-${crypto.randomUUID().slice(0, 12)}`;
    try {
      sessionStorage.setItem(ID_KEY, id);
    } catch {
      // Same as above.
    }
  }
  return id;
}

/** « Firefox · Linux », from the browser itself. */
function defaultName(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} · ${os}` : browser;
}

function plainSong(t: Song): Song {
  return { id: t.id, title: t.title, artist: t.artist, album: t.album, albumId: t.albumId, artistId: t.artistId, coverArt: t.coverArt, duration: t.duration } as Song;
}

/** What this browser plays, as sent to the others. */
function stateOf(player: PlayerContextValue, transport: Transport): PlayerUpdate {
  const song = player.current;
  const tracks = song ? [song, ...upcomingOrder(player.queue)].slice(0, QUEUE_SENT).map(plainSong) : [];
  return {
    track: song?.id,
    title: song?.title,
    artist: song?.artist,
    album: song?.album,
    coverArt: song?.coverArt,
    duration: song?.duration ? Math.round(song.duration) : undefined,
    playing: player.playing,
    position: Math.round(currentPosition() * 1000),
    queue: { tracks, sourceId: player.sourceId },
    shuffle: player.modes.shuffle,
    repeat: player.modes.repeat,
    volume: Math.round(transport.volume * 100),
  };
}

export function ConnectProvider({ children }: { children: ReactNode }) {
  const { session } = useApp();
  const musonic = useMusonicServer(session);
  const player = usePlayer();
  const transport = useTransport();
  const [me] = useState(deviceId);
  const [name, setNameState] = useState(() => read(NAME_KEY) || defaultName());
  const [alone, setAloneState] = useState(() => read(ALONE_KEY) === '1');
  const [snapshot, setSnapshot] = useState<ConnectSnapshot>({ connected: false, devices: [], players: {}, sync: true });
  const [failed, setFailed] = useState(0);
  const clientRef = useRef<ConnectClient | null>(null);
  // Listeners registered once read the latest player through this ref.
  const latest = useRef({ player, transport, alone });
  useLayoutEffect(() => {
    latest.current = { player, transport, alone };
  });

  const applyHandover = useCallback((h: Handover) => {
    if (!h?.tracks?.length) return;
    setStartAt(h.position / 1000);
    latest.current.player.playSongs(h.tracks, 0, h.sourceId);
  }, []);

  const obey = useCallback(
    (command: Command) => {
      const { player: p, transport: t } = latest.current;
      const params = (command.params ?? {}) as Record<string, unknown>;
      switch (command.action) {
        case 'play':
          if (!p.playing) t.togglePlay();
          break;
        case 'pause':
          if (p.playing) t.togglePlay();
          break;
        case 'toggle':
          t.togglePlay();
          break;
        case 'next':
          if (p.hasNext) p.next();
          break;
        case 'previous':
          t.previous();
          break;
        case 'seek':
          if (typeof params.position === 'number') t.seek(params.position / 1000);
          break;
        case 'volume':
          if (typeof params.volume === 'number') t.setVolume(Math.min(1, Math.max(0, params.volume / 100)));
          break;
        case 'transfer':
          applyHandover(params as unknown as Handover);
          break;
        default:
          break;
      }
    },
    [applyHandover],
  );

  // One connection per signed-in account, on a Musonic Server only.
  useEffect(() => {
    if (!musonic) return;
    let alive = true;
    let client: ConnectClient | null = null;
    void (async () => {
      try {
        const [{ baseUrl, token }, settings] = await Promise.all([
          liveAccess(session),
          v1<{ connectSync: boolean }>(session, '/v1/me/settings').catch(() => ({ connectSync: true })),
        ]);
        if (!alive) return;
        client = new ConnectClient({
          baseUrl,
          token,
          deviceId: me,
          device: { name: read(NAME_KEY) || defaultName(), kind: 'web', canPlay: true, volume: true, alone: read(ALONE_KEY) === '1' },
          sync: settings.connectSync,
          onCommand: obey,
          onCommandFailed: () => setFailed(Date.now()),
          onChange: (s) => {
            setSnapshot(s);
            // Another device started after this one: it takes over (synced playback).
            const { player: p, transport: t, alone: meAlone } = latest.current;
            const other = activeElsewhere(s, me);
            const mine = s.players[me];
            if (p.playing && other && mine && other.positionAt > mine.positionAt && shouldYield(other, s, me, meAlone)) t.togglePlay();
          },
        });
        clientRef.current = client;
        client.start();
        // Nothing loaded here yet: the account's last listening, paused where it stopped (on
        // this device or another one).
        const last = await v1<{ player: { queue?: Handover | null; position: number } | null }>(session, '/v1/me/player').catch(() => null);
        const queue = last?.player?.queue;
        if (alive && queue?.tracks?.length && !latest.current.player.current) {
          setStartPaused();
          applyHandover({ tracks: queue.tracks, position: last?.player?.position ?? 0, sourceId: queue.sourceId ?? null });
        }
      } catch {
        // No live connection: Musonic Web works as before.
      }
    })();
    return () => {
      alive = false;
      client?.stop();
      clientRef.current = null;
    };
  }, [musonic, session, me, obey, applyHandover]);

  // What plays here, sent when it changes (not the position as it moves: the others compute it).
  const song = player.current;
  useEffect(() => {
    clientRef.current?.publish(stateOf(latest.current.player, latest.current.transport));
  }, [snapshot.connected, song?.entryId, player.playing, player.modes, transport.volume, player.queue]);

  // A jump in the track (seek, −15 / +30 s) is sent too: the others follow the position by themselves otherwise.
  useEffect(() => {
    let last = { at: Date.now(), position: currentPosition() };
    return subscribePosition(() => {
      const now = Date.now();
      const position = currentPosition();
      const expected = last.position + (latest.current.player.playing ? (now - last.at) / 1000 : 0);
      if (Math.abs(position - expected) > 2) clientRef.current?.publish(stateOf(latest.current.player, latest.current.transport));
      last = { at: now, position };
    });
  }, []);

  const setName = useCallback((value: string) => {
    const next = value.trim().slice(0, 64) || defaultName();
    setNameState(next);
    write(NAME_KEY, next);
    clientRef.current?.setDevice({ name: next, kind: 'web', canPlay: true, volume: true, alone: read(ALONE_KEY) === '1' });
  }, []);

  const setAlone = useCallback((value: boolean) => {
    setAloneState(value);
    write(ALONE_KEY, value ? '1' : '0');
    clientRef.current?.setDevice({ name: read(NAME_KEY) || defaultName(), kind: 'web', canPlay: true, volume: true, alone: value });
  }, []);

  const setSync = useCallback(
    (sync: boolean) => {
      clientRef.current?.setSync(sync);
      void v1(session, '/v1/me/settings', { method: 'PUT', body: { connectSync: sync } }).catch(() => {});
    },
    [session],
  );

  // Shown while this browser does not play: the device used last elsewhere, paused or not,
  // when it was used after this one.
  // Synced playback off: each device plays on its own, no remote mode.
  const last = player.playing || !snapshot.sync ? null : activeElsewhere(snapshot, me, true);
  const mine = snapshot.players[me];
  const elsewhere = last && (last.playing || !mine || !player.current || last.positionAt > mine.positionAt) ? last : null;

  const value = useMemo<ConnectValue | null>(() => {
    if (!musonic) return null;
    const client = () => clientRef.current;
    return {
      me,
      snapshot,
      elsewhere,
      remote: (action, params) => elsewhere && client()?.command(elsewhere.device, action, params ?? null),
      transfer: (device) => {
        const c = client();
        const { player: p, transport: t } = latest.current;
        // From here when it plays, else from the device used elsewhere, else what this one holds.
        const source = p.playing ? null : elsewhere;
        const queue = (source?.queue ?? null) as { tracks?: Song[]; sourceId?: string | null } | null;
        const here = !source && p.current ? (stateOf(p, t).queue as { tracks: Song[] }) : null;
        const handover: Handover | null = here
          ? { tracks: here.tracks, position: Math.round(currentPosition() * 1000), sourceId: p.sourceId }
          : source && queue?.tracks?.length
            ? { tracks: queue.tracks, position: positionOf(source), sourceId: queue.sourceId ?? null }
            : null;
        if (!handover || !c) return;
        if (device === me) {
          applyHandover(handover);
          if (source?.playing) c.command(source.device, 'pause');
          return;
        }
        c.command(device, 'transfer', handover);
        if (source?.playing) c.command(source.device, 'pause');
        else if (p.playing) t.togglePlay();
      },
      name,
      setName,
      alone,
      setAlone,
      setSync,
      failed,
    };
  }, [musonic, me, snapshot, elsewhere, name, setName, alone, setAlone, setSync, failed, applyHandover]);

  return <ConnectContext.Provider value={value}>{children}</ConnectContext.Provider>;
}
