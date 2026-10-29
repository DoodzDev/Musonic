/**
 * @file connectService.ts
 * @description Musonic Connect (ADR-019) on the phone, on a Musonic Server:
 *   the phone registers as a device, says what it plays when that changes
 *   (track, play / pause, a jump), obeys the commands sent to it (from Musonic
 *   Web or another phone), pauses when another device of the account starts
 *   (synced playback), takes over a queue transferred to it, and at launch
 *   takes up the account's last listening when it is newer than the phone's
 *   own, paused where it stopped. Started by the playback service, so it also
 *   runs with the screen off.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {Platform} from 'react-native';
import {
  ConnectClient,
  activeElsewhere,
  positionOf,
  shouldYield,
  type Command,
  type ConnectSnapshot,
  type PlayerUpdate,
} from '@musonic/core/connect';
import TrackPlayer, {Event, State} from '../player';
import {playbackEngine} from '../playback/engine';
import {skipNext, skipPrev} from '../playerActions';
import {onJump} from './jumps';
import {usePlayerStore, type Track} from '../../store/playerStore';
import {useSettingsStore, type Server} from '../../store/settingsStore';
import {storage} from '../../store/storage';
import {songToTrack} from '../../utils/songToTrack';

const ID_KEY = 'connect-device';
const NAME_KEY = 'connect-name';
const ALONE_KEY = 'connect-alone';
/** When this phone last said what it plays (ms): the account's last listening wins only if newer. */
const LOCAL_AT_KEY = 'connect-local-at';
const QUEUE_SENT = 100;

type Handover = {tracks: {id: string; title?: string; artist?: string; album?: string; coverArt?: string; duration?: number}[]; position: number; sourceId?: string | null};

let client: ConnectClient | null = null;
let snapshot: ConnectSnapshot = {connected: false, devices: [], players: {}, sync: true};
let playing = false;
const listeners = new Set<(s: ConnectSnapshot) => void>();

export function deviceId(): string {
  let id = storage.getString(ID_KEY);
  if (!id) {
    id = `phone-${Math.random().toString(36).slice(2, 14)}`;
    storage.set(ID_KEY, id);
  }
  return id;
}

export function deviceName(): string {
  const model = (Platform.constants as {Model?: string}).Model;
  return storage.getString(NAME_KEY) || model || 'Android';
}

export function isAlone(): boolean {
  return storage.getBoolean(ALONE_KEY) ?? false;
}

function device() {
  return {name: deviceName(), kind: 'phone', canPlay: true, volume: false, alone: isAlone()};
}

/** Follows the account's devices and what they play (the screens' remote mode). */
export function subscribeConnect(listener: (s: ConnectSnapshot) => void): () => void {
  listeners.add(listener);
  listener(snapshot);
  return () => listeners.delete(listener);
}

export function connectSnapshot(): ConnectSnapshot {
  return snapshot;
}

function rootOf(url: string): string {
  return url.replace(/\/+$/, '').replace(/\/rest$/, '');
}

function activeServer(): Server | null {
  const {servers, activeServerId} = useSettingsStore.getState();
  return servers.find(s => s.id === activeServerId) ?? null;
}

async function v1<T>(server: Server, path: string, init: {method?: string; body?: unknown} = {}): Promise<T> {
  const res = await fetch(`${rootOf(server.url)}${path}`, {
    method: init.method ?? 'GET',
    headers: {Authorization: `Bearer ${server.apiKey}`, ...(init.body === undefined ? {} : {'Content-Type': 'application/json'})},
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

function plain(t: Track) {
  return {id: String(t.id), title: t.title, artist: t.artist, album: t.album, coverArt: t.coverArt, duration: t.duration};
}

/** What the phone plays now. */
async function stateNow(): Promise<PlayerUpdate> {
  const {queue, upcoming, shuffleMode, repeatMode} = usePlayerStore.getState();
  const current = queue[0];
  const {position} = await TrackPlayer.getProgress().catch(() => ({position: 0}));
  const tracks = current ? [current, ...upcoming].slice(0, QUEUE_SENT).map(plain) : [];
  return {
    track: current ? String(current.id) : undefined,
    title: current?.title,
    artist: current?.artist,
    album: current?.album,
    coverArt: current?.coverArt,
    duration: current?.duration ? Math.round(current.duration) : undefined,
    playing,
    position: Math.round(position * 1000),
    queue: {tracks, sourceId: null},
    shuffle: shuffleMode,
    repeat: repeatMode,
  };
}

/** Sends what the phone plays (after a change); also remembered as the phone's last listening time. */
export function publishConnect(): void {
  if (!client) return;
  storage.set(LOCAL_AT_KEY, Date.now());
  stateNow()
    .then(s => client?.publish(s))
    .catch(() => {});
}

/** A queue from another device (transfer, or the account's last listening), at its position. */
async function takeOver(h: Handover, play: boolean): Promise<void> {
  if (!h?.tracks?.length) return;
  const tracks = h.tracks.map(t => songToTrack({...t, id: t.id, title: t.title ?? '', duration: t.duration} as never));
  await playbackEngine.playContext(
    {source: {type: 'other'}, tracks, startTrackId: tracks[0].id},
    {play, position: Math.max(0, h.position / 1000)},
  );
}

async function obey(command: Command): Promise<void> {
  const params = (command.params ?? {}) as Record<string, unknown>;
  switch (command.action) {
    case 'play':
      await TrackPlayer.play();
      break;
    case 'pause':
      await TrackPlayer.pause();
      break;
    case 'toggle':
      await (playing ? TrackPlayer.pause() : TrackPlayer.play());
      break;
    // The same as the notification's buttons (previous restarts the track after 3 s).
    case 'next':
      await skipNext();
      break;
    case 'previous':
      await skipPrev();
      break;
    case 'seek':
      if (typeof params.position === 'number') {
        await TrackPlayer.seekTo(params.position / 1000);
        publishConnect();
      }
      break;
    case 'transfer':
      await takeOver(params as unknown as Handover, true);
      break;
    default:
      break;
  }
}

/** At launch: the account's last listening, when newer than the phone's own and nothing plays. */
async function resumeAccount(server: Server, me: string): Promise<void> {
  const last = await v1<{player: (PlayerUpdate & {device: string; position: number; queue?: Handover}) | null; updatedAt: number | null}>(
    server,
    '/v1/me/player',
  ).catch(() => null);
  const localAt = storage.getNumber(LOCAL_AT_KEY) ?? 0;
  if (!last?.player || !last.updatedAt || last.player.device === me || last.updatedAt * 1000 <= localAt) return;
  if (playing || !last.player.queue?.tracks?.length) return;
  storage.set(LOCAL_AT_KEY, Date.now());
  await takeOver({...last.player.queue, position: last.player.position}, false);
}

function emit(): void {
  for (const l of listeners) l(snapshot);
}

/** One connection for the active account; started again when the account changes. */
function connect(): void {
  client?.stop();
  client = null;
  snapshot = {connected: false, devices: [], players: {}, sync: true};
  emit();
  const server = activeServer();
  if (!server?.apiKey) return; // Musonic Server only (device key)
  const me = deviceId();
  const c = new ConnectClient({
    baseUrl: rootOf(server.url),
    token: server.apiKey,
    deviceId: me,
    device: device(),
    onCommand: command => {
      obey(command).catch(() => {});
    },
    onChange: s => {
      snapshot = s;
      emit();
      // Another device started after the phone: it takes over (synced playback).
      const other = activeElsewhere(s, me);
      const mine = s.players[me];
      if (playing && other && mine && other.positionAt > mine.positionAt && shouldYield(other, s, me, isAlone())) {
        TrackPlayer.pause().catch(() => {});
      }
    },
  });
  client = c;
  v1<{connectSync: boolean}>(server, '/v1/me/settings')
    .then(r => c.setSync(r.connectSync))
    .catch(() => {});
  c.start();
  resumeAccount(server, me).catch(() => {});
  publishConnect();
}

/** A command to another device (the screens' remote mode and transfer). */
export function sendConnectCommand(to: string, action: string, params?: unknown): void {
  client?.command(to, action, params ?? null);
}

/** The device used last elsewhere (playing, or paused since), when it is newer than the phone. */
export function elsewhereNow(s: ConnectSnapshot = snapshot) {
  const me = deviceId();
  const last = activeElsewhere(s, me, true);
  const mine = s.players[me];
  return last && (last.playing || !mine || !mine.track || last.positionAt > mine.positionAt) && !(playing && !last.playing) ? last : null;
}

export function isPlayingHere(): boolean {
  return playing;
}

/**
 * Playback moves to `to` (this phone included) at the same second: from the phone when it
 * plays or nothing plays elsewhere, else from the device used elsewhere (paused there).
 */
export async function moveTo(to: string): Promise<void> {
  const c = client;
  if (!c) return;
  const me = deviceId();
  const source = playing ? null : elsewhereNow();
  if (source) {
    const queue = source.queue as Handover | undefined;
    if (!queue?.tracks?.length || source.device === to) return;
    const handover = {...queue, position: positionOf(source)};
    if (to === me) await takeOver(handover, true);
    else c.command(to, 'transfer', handover);
    if (source.playing) c.command(source.device, 'pause');
    return;
  }
  if (to === me) return;
  const s = await stateNow();
  const queue = s.queue as Handover;
  if (!queue.tracks.length) return;
  c.command(to, 'transfer', {...queue, position: s.position});
  if (playing) await TrackPlayer.pause();
}

export function setDeviceName(name: string): void {
  storage.set(NAME_KEY, name.trim().slice(0, 64));
  client?.setDevice(device());
}

export function setAlone(alone: boolean): void {
  storage.set(ALONE_KEY, alone);
  client?.setDevice(device());
}

export function setSync(sync: boolean): void {
  client?.setSync(sync);
  const server = activeServer();
  if (server?.apiKey) v1(server, '/v1/me/settings', {method: 'PUT', body: {connectSync: sync}}).catch(() => {});
}

let started = false;

/** Started once by the playback service. */
export function startConnect(): void {
  if (started) return;
  started = true;
  TrackPlayer.addEventListener(Event.PlaybackState, ({state}) => {
    const now = state === State.Playing;
    // Buffering after a jump keeps « playing »: only a real change is sent.
    if (now !== playing && (state === State.Playing || state === State.Paused || state === State.Stopped || state === State.Ended)) {
      playing = now;
      publishConnect();
    }
  });
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, () => publishConnect());
  onJump(publishConnect);
  usePlayerStore.subscribe((s, prev) => {
    if (s.shuffleMode !== prev.shuffleMode || s.repeatMode !== prev.repeatMode) publishConnect();
  });
  // Another account, or the same one signed in again (new key): a new connection. The
  // connection itself comes back by itself after a cut.
  const accountKey = () => {
    const server = activeServer();
    return server ? `${server.url}|${server.username}|${server.apiKey ?? ''}` : '';
  };
  let account = accountKey();
  useSettingsStore.subscribe(() => {
    const next = accountKey();
    if (next !== account) {
      account = next;
      connect();
    }
  });
  connect();
}
