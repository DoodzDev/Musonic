/**
 * @file snapshot.ts
 * @description Saves the playback engine's queue model to MMKV so the queue
 *   and the position come back when the app is reopened (R4.0c).
 *
 *   - The snapshot never holds a URL: stream and cover URLs carry the account
 *     credentials. They are rebuilt from the track ids when restoring.
 *   - A snapshot belongs to one account and is ignored for any other.
 *   - The queue is written at most once per second; the position is a single
 *     number written on pause, in the background and every few seconds.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {storage} from '../../store/storage';
import type {QueueState, QueueTrack} from './buildQueue';

const QUEUE_KEY = 'playback-snapshot';
const POSITION_KEY = 'playback-position';
/** Bump on any change to the saved shape; older snapshots are then ignored. */
export const SNAPSHOT_VERSION = 1;
const SAVE_DELAY_MS = 1000;

type Snapshot<T extends QueueTrack> = {
  version: number;
  accountId: string;
  state: QueueState<T>;
};

type SavedPosition = {trackId: string; seconds: number};

/** Fields that may carry credentials, rebuilt on restore. */
type UrlFields = {url?: string; streamUrl?: string; artwork?: string};

/** Copy of a track without its URLs (local file artwork is kept, it holds no secret). */
export function stripUrls<T extends QueueTrack & UrlFields>(track: T): T {
  const copy = {...track};
  delete copy.url;
  delete copy.streamUrl;
  if (copy.artwork && /^https?:/i.test(copy.artwork)) delete copy.artwork;
  return copy;
}

function mapTracks<T extends QueueTrack>(state: QueueState<T>, map: (t: T) => T): QueueState<T> {
  return {
    source: state.source,
    contextTracks: state.contextTracks.map(map),
    history: state.history.map(map),
    current: state.current ? map(state.current) : null,
    userQueue: state.userQueue.map(map),
    upcoming: state.upcoming.map(map),
    autoplay: state.autoplay.map(map),
  };
}

/** Serialises a queue model for one account, without any URL. */
export function serializeSnapshot<T extends QueueTrack & UrlFields>(state: QueueState<T>, accountId: string): string {
  const snapshot: Snapshot<T> = {version: SNAPSHOT_VERSION, accountId, state: mapTracks(state, stripUrls)};
  return JSON.stringify(snapshot);
}

/**
 * Reads a saved queue model back. Returns null when it is missing, broken,
 * from another version or another account, or has no current track.
 * `hydrate` rebuilds the URLs of each track.
 */
export function parseSnapshot<T extends QueueTrack>(
  raw: string | undefined | null,
  accountId: string,
  hydrate: (t: T) => T,
): QueueState<T> | null {
  if (!raw) return null;
  try {
    const snapshot = JSON.parse(raw) as Snapshot<T>;
    if (snapshot.version !== SNAPSHOT_VERSION || snapshot.accountId !== accountId) return null;
    if (!snapshot.state?.current) return null;
    return mapTracks(snapshot.state, hydrate);
  } catch {
    return null;
  }
}

let pending: {state: QueueState<any>; accountId: string} | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Saves the queue soon, grouping close changes into one write. */
export function scheduleQueueSave<T extends QueueTrack & UrlFields>(state: QueueState<T>, accountId: string): void {
  pending = {state, accountId};
  if (timer) return;
  timer = setTimeout(flushQueueSave, SAVE_DELAY_MS);
}

/** Writes a pending queue save now (app going to the background). */
export function flushQueueSave(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!pending) return;
  const {state, accountId} = pending;
  pending = null;
  if (state.current) storage.set(QUEUE_KEY, serializeSnapshot(state, accountId));
  else clearSnapshot();
}

export function loadQueue<T extends QueueTrack>(accountId: string, hydrate: (t: T) => T): QueueState<T> | null {
  return parseSnapshot(storage.getString(QUEUE_KEY), accountId, hydrate);
}

export function savePosition(trackId: string, seconds: number): void {
  const saved: SavedPosition = {trackId, seconds};
  storage.set(POSITION_KEY, JSON.stringify(saved));
}

/** Saved position of this track, 0 when it was saved for another track. */
export function loadPosition(trackId: string): number {
  try {
    const saved = JSON.parse(storage.getString(POSITION_KEY) ?? 'null') as SavedPosition | null;
    return saved && saved.trackId === trackId && saved.seconds > 0 ? saved.seconds : 0;
  } catch {
    return 0;
  }
}

export function clearSnapshot(): void {
  storage.delete(QUEUE_KEY);
  storage.delete(POSITION_KEY);
}
