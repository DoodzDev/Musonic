/**
 * @file connect.ts
 * @description Musonic Connect (ADR-019), client side, shared by Musonic Web and
 *   the mobile app: this device registers on `/v1/events`, sends what it plays
 *   when it changes, learns the account's devices and what they play, and gets
 *   the remote commands meant for it. Positions are computed without comparing
 *   clocks: each state carries the server time it was sent at. Reconnects by
 *   itself (1 s, then up to 30 s). Who pauses when another device starts is
 *   decided here too (`shouldYield`): the last one to start takes over, unless
 *   synced playback is off or either device plays alone.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

import type { Command } from '../server/generated/Command.ts';
import type { ConnectDevice } from '../server/generated/ConnectDevice.ts';
import type { Player } from '../server/generated/Player.ts';

export type { Command, ConnectDevice, Player };

/** What this device says of itself (its id is the one it connects with). */
export type DeviceInfo = Omit<ConnectDevice, 'id'>;

/** What this device plays, as it sends it (the server adds the device and the time). */
export type PlayerUpdate = Omit<Player, 'device' | 'positionAt'>;

/** A device's state as received: `anchor` is the local time its `position` was true at. */
export type RemotePlayer = Player & { anchor: number };

export type ConnectSnapshot = {
  connected: boolean;
  devices: ConnectDevice[];
  /** By device id, online devices only. */
  players: Record<string, RemotePlayer>;
  /** Synced playback (account setting). */
  sync: boolean;
};

/** The minimal WebSocket both the browser and React Native provide. */
type Socket = {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
};

export type ConnectOptions = {
  /** `https://server` (no trailing slash). */
  baseUrl: string;
  /** A device key or a session token. */
  token: string;
  deviceId: string;
  device: DeviceInfo;
  /** Synced playback as last known (`GET /v1/me/settings`); updated by the server's events. */
  sync?: boolean;
  /** A command for this device. */
  onCommand: (command: Command) => void;
  /** A command of this device that did not reach its target. */
  onCommandFailed?: (command: Command, reason: string) => void;
  /** Anything shown changed. */
  onChange: (snapshot: ConnectSnapshot) => void;
  /** Injected in tests. */
  createSocket?: (url: string) => Socket;
  now?: () => number;
};

const OPEN = 1;
const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 30_000;

/** Where `player` is now, ms (it moves on only while playing). */
export function positionOf(player: RemotePlayer, now = Date.now()): number {
  const moved = player.playing ? Math.max(0, now - player.anchor) : 0;
  const end = player.duration ? player.duration * 1000 : Infinity;
  return Math.min(player.position + moved, end);
}

/**
 * The device playing for the account, other than `me`: the last one that started, among
 * the online devices that do not play alone. None when nothing plays elsewhere. With
 * `paused`, the last one used even if paused since (to resume it remotely).
 */
export function activeElsewhere(snapshot: ConnectSnapshot, me: string, paused = false): RemotePlayer | null {
  const alone = new Set(snapshot.devices.filter((d) => d.alone).map((d) => d.id));
  let best: RemotePlayer | null = null;
  for (const p of Object.values(snapshot.players)) {
    if (p.device === me || alone.has(p.device) || (!p.playing && !paused) || !p.track) continue;
    if (!best || p.positionAt > best.positionAt) best = p;
  }
  return best;
}

/**
 * Whether this device, playing, pauses for `started` (another device's state just received):
 * the last one to start takes over, with synced playback on and neither device alone.
 */
export function shouldYield(started: Player, snapshot: ConnectSnapshot, me: string, meAlone: boolean): boolean {
  if (!snapshot.sync || meAlone || started.device === me || !started.playing) return false;
  return !snapshot.devices.some((d) => d.id === started.device && d.alone);
}

export class ConnectClient {
  private socket: Socket | null = null;
  private retryMs = RETRY_MIN_MS;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private last: PlayerUpdate | null = null;
  private snapshot: ConnectSnapshot;
  private readonly now: () => number;
  private readonly options: ConnectOptions;

  constructor(options: ConnectOptions) {
    this.options = options;
    this.now = options.now ?? Date.now;
    this.snapshot = { connected: false, devices: [], players: {}, sync: options.sync ?? true };
  }

  get state(): ConnectSnapshot {
    return this.snapshot;
  }

  get deviceId(): string {
    return this.options.deviceId;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.update({ connected: false, devices: [], players: {} });
  }

  /** This device's name or « plays alone » changed: told at once, and at each reconnection. */
  setDevice(device: DeviceInfo): void {
    this.options.device = device;
    this.send({ type: 'register', ...device });
  }

  setSync(sync: boolean): void {
    this.update({ sync });
  }

  /** What this device plays now; kept and sent again after a reconnection. */
  publish(player: PlayerUpdate): void {
    this.last = player;
    this.send({ type: 'player', ...player });
  }

  /** A command to another device (or, for an administrator, another account's: `user`). */
  command(to: string, action: string, params: unknown = null, user?: string): void {
    this.send({ type: 'command', to, action, params, ...(user ? { user } : {}) });
  }

  private send(message: object): boolean {
    if (this.socket?.readyState !== OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  private open(): void {
    const { baseUrl, token, deviceId } = this.options;
    const url = `${baseUrl.replace(/^http/, 'ws')}/v1/events?token=${encodeURIComponent(token)}&device=${encodeURIComponent(deviceId)}`;
    const create = this.options.createSocket ?? ((u: string) => new WebSocket(u) as unknown as Socket);
    let socket: Socket;
    try {
      socket = create(url);
    } catch {
      this.retry();
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      this.retryMs = RETRY_MIN_MS;
      this.update({ connected: true });
      this.send({ type: 'register', ...this.options.device });
      if (this.last) this.send({ type: 'player', ...this.last });
    };
    socket.onmessage = (ev) => {
      if (typeof ev.data === 'string') this.receive(ev.data);
    };
    socket.onerror = () => {};
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.update({ connected: false, devices: [], players: {} });
      this.retry();
    };
  }

  private retry(): void {
    if (this.stopped || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.stopped) this.open();
    }, this.retryMs);
    this.retryMs = Math.min(this.retryMs * 2, RETRY_MAX_MS);
  }

  private receive(data: string): void {
    let message: { type?: string; [key: string]: unknown };
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }
    switch (message.type) {
      case 'devices': {
        const devices = (message.devices as ConnectDevice[]) ?? [];
        const online = new Set(devices.map((d) => d.id));
        const players = Object.fromEntries(Object.entries(this.snapshot.players).filter(([id]) => online.has(id)));
        this.update({ devices, players });
        break;
      }
      case 'player': {
        const player = message.player as Player;
        const sentAt = typeof message.now === 'number' ? message.now : player.positionAt;
        // The server's « now » is this device's « now »: the delay in between is the network's.
        const anchor = this.now() - Math.max(0, sentAt - player.positionAt);
        this.update({ players: { ...this.snapshot.players, [player.device]: { ...player, anchor } } });
        break;
      }
      case 'command': {
        const command = message.command as Command;
        if (command.to === this.options.deviceId) this.options.onCommand(command);
        break;
      }
      case 'commandFailed':
        this.options.onCommandFailed?.(message.command as Command, String(message.reason ?? ''));
        break;
      case 'settings':
        if (typeof message.connectSync === 'boolean') this.update({ sync: message.connectSync });
        break;
      default:
        break;
    }
  }

  private update(change: Partial<ConnectSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...change };
    this.options.onChange(this.snapshot);
  }
}
