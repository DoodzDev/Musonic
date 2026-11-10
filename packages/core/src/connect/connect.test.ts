/**
 * @file connect.test.ts
 * @description Unit tests of the Musonic Connect client (ADR-019): registers and
 *   sends again what plays after a reconnection, follows the account's devices,
 *   computes positions from the server's times, keeps only its own commands, and
 *   the rule of who pauses when another device starts.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectClient, activeElsewhere, positionOf, shouldYield, type ConnectSnapshot, type Player } from './connect.ts';

class FakeSocket {
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  constructor(public url: string) {}
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(message: object) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  drop() {
    this.readyState = 3;
    this.onclose?.({});
  }
}

const device = { name: 'Firefox sur PC', kind: 'web', canPlay: true, volume: true, alone: false };
const player = (over: Partial<Player>): Player => ({ device: 'phone', playing: true, position: 10_000, positionAt: 1_000, track: 't1', ...over });

function client(now = () => 50_000) {
  const sockets: FakeSocket[] = [];
  const onCommand = vi.fn();
  const changes: ConnectSnapshot[] = [];
  const c = new ConnectClient({
    baseUrl: 'https://music.example.org',
    token: 'mk_key',
    deviceId: 'pc',
    device,
    onCommand,
    onChange: (s) => changes.push(s),
    createSocket: (url) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      return s;
    },
    now,
  });
  return { c, sockets, onCommand, changes };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('ConnectClient', () => {
  it('registers on open and sends again what plays after a reconnection', () => {
    const { c, sockets } = client();
    c.start();
    expect(sockets[0].url).toBe('wss://music.example.org/v1/events?token=mk_key&device=pc');
    c.publish({ track: 't1', playing: true, position: 0 }); // not connected yet: kept
    sockets[0].open();
    expect(sockets[0].sent.map((m) => m.type)).toEqual(['register', 'player']);
    expect(sockets[0].sent[0]).toMatchObject({ name: 'Firefox sur PC', kind: 'web' });

    sockets[0].drop();
    expect(c.state.connected).toBe(false);
    vi.advanceTimersByTime(1000);
    sockets[1].open();
    expect(sockets[1].sent.map((m) => m.type)).toEqual(['register', 'player']);
    c.stop();
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(2);
  });

  it('follows the devices and dates positions with the server clock', () => {
    const { c, sockets } = client(() => 50_000);
    c.start();
    sockets[0].open();
    sockets[0].receive({ type: 'devices', devices: [{ id: 'pc', ...device }, { id: 'phone', ...device, kind: 'phone' }] });
    // Sent by the server 200 ms after the phone's state: the phone was then at 10.2 s.
    sockets[0].receive({ type: 'player', player: player({}), now: 1_200 });
    const p = c.state.players.phone;
    expect(p.anchor).toBe(49_800);
    expect(positionOf(p, 50_000)).toBe(10_200);
    expect(positionOf({ ...p, playing: false }, 90_000)).toBe(10_000);
    expect(positionOf({ ...p, duration: 12 }, 90_000)).toBe(12_000);

    // The phone leaves: what it played goes too.
    sockets[0].receive({ type: 'devices', devices: [{ id: 'pc', ...device }] });
    expect(c.state.players).toEqual({});
    sockets[0].receive({ type: 'settings', connectSync: false });
    expect(c.state.sync).toBe(false);
  });

  it('keeps only the commands meant for this device', () => {
    const { c, sockets, onCommand } = client();
    c.start();
    sockets[0].open();
    sockets[0].receive({ type: 'command', command: { to: 'phone', action: 'pause', params: null, from: 'pc' } });
    sockets[0].receive({ type: 'command', command: { to: 'pc', action: 'seek', params: { position: 5000 }, from: 'phone' } });
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(onCommand.mock.calls[0][0]).toMatchObject({ action: 'seek', params: { position: 5000 } });
    c.command('phone', 'next');
    expect(sockets[0].sent.at(-1)).toEqual({ type: 'command', to: 'phone', action: 'next', params: null });
  });
});

describe('who plays', () => {
  const snapshot = (sync: boolean, aloneIds: string[] = []): ConnectSnapshot => ({
    connected: true,
    sync,
    devices: ['pc', 'phone', 'car'].map((id) => ({ id, ...device, alone: aloneIds.includes(id) })),
    players: {},
  });

  it('the last one to start takes over, unless synced playback is off or a device plays alone', () => {
    expect(shouldYield(player({}), snapshot(true), 'pc', false)).toBe(true);
    expect(shouldYield(player({ playing: false }), snapshot(true), 'pc', false)).toBe(false);
    expect(shouldYield(player({ device: 'pc' }), snapshot(true), 'pc', false)).toBe(false);
    expect(shouldYield(player({}), snapshot(false), 'pc', false)).toBe(false);
    expect(shouldYield(player({}), snapshot(true), 'pc', true)).toBe(false);
    expect(shouldYield(player({}), snapshot(true, ['phone']), 'pc', false)).toBe(false);
  });

  it('shows the device that started last, never this one nor one playing alone', () => {
    const s = snapshot(true, ['car']);
    s.players = {
      pc: { ...player({ device: 'pc', positionAt: 9_000 }), anchor: 0 },
      phone: { ...player({ positionAt: 2_000 }), anchor: 0 },
      car: { ...player({ device: 'car', positionAt: 5_000 }), anchor: 0 },
    };
    expect(activeElsewhere(s, 'pc')?.device).toBe('phone');
    s.players.phone.playing = false;
    expect(activeElsewhere(s, 'pc')).toBeNull();
    expect(activeElsewhere(s, 'pc', true)?.device).toBe('phone');
  });
});
