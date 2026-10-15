/**
 * @file buildQueue.ts
 * @description Pure playback rules of the playback engine (ADR-009 matrix).
 *   The queue is a model in zones, like Spotify:
 *   history | current | added by you | rest of the context | autoplay.
 *   Every function takes a state and returns a new one, without touching the
 *   native player, so each matrix row is a plain unit test. Randomness is
 *   injected (`Rng`) to keep tests deterministic. Natural end of a track with
 *   repeat one (C5) and the crossfade rule (E3) are handled by the engine.
 * @author DoodzProg
 * @version 1.2.0
 * @license CC-BY-NC-4.0
 */

/** Minimal shape the rules need; real tracks carry more fields. */
export type QueueTrack = {
  id: string;
  /**
   * Unique per queue entry (set by the engine): the same track twice in a
   * queue gets two entries, so a move or a removal targets the right copy.
   */
  entryId?: string;
  /** Suggestion inserted by the Magic shuffle. */
  isMagic?: boolean;
  /** Suggestion added by autoplay at the end of the queue. */
  isAutoplay?: boolean;
};

export type SourceType =
  | 'playlist'
  | 'album'
  | 'artist'
  | 'liked'
  | 'library'
  | 'search'
  | 'recommendations'
  /** A Magic Mix of the Home (id: the genre). */
  | 'mix'
  | 'other';

/** Where the context comes from ("Playing from…"). */
export type PlaySource = {type: SourceType; id?: string; name?: string};

export type ShuffleMode = 'off' | 'on' | 'magic';
export type RepeatMode = 'none' | 'all' | 'one';

export type Modes = {
  shuffle: ShuffleMode;
  repeat: RepeatMode;
  /** Autoplay at the end of the queue (on by default). */
  autoplay: boolean;
};

/** Returns a float in [0, 1), like Math.random. */
export type Rng = () => number;

export type QueueState<T extends QueueTrack> = {
  source: PlaySource | null;
  /** The context in its original order (playlist, album…). */
  contextTracks: T[];
  /** Tracks actually played, oldest first ("Previous" walks back here). */
  history: T[];
  current: T | null;
  /** "Added by you": never shuffled, kept across contexts. */
  userQueue: T[];
  /** Rest of the context, in play order (may hold Magic suggestions). */
  upcoming: T[];
  /** Autoplay suggestions, played after everything else. */
  autoplay: T[];
};

export type PlayContext<T extends QueueTrack> = {
  source: PlaySource;
  tracks: T[];
  /** Track tapped in the list; none = the Play button. */
  startTrackId?: string;
};

/** Seconds after which "Previous" restarts the track instead (C1). */
export const PREVIOUS_RESTART_SECONDS = 3;
/** Magic: one suggestion after every N context tracks (A3). */
export const MAGIC_EVERY = 2;
/** History kept for "Previous"; older tracks are dropped. */
export const HISTORY_LIMIT = 200;

export function emptyQueue<T extends QueueTrack>(): QueueState<T> {
  return {source: null, contextTracks: [], history: [], current: null, userQueue: [], upcoming: [], autoplay: []};
}

/** What queue edits target: the entry, or the track id when no entry id is set. */
export function entryKey(t: QueueTrack): string {
  return t.entryId ?? t.id;
}

/** Fisher-Yates shuffle on a copy. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pushHistory<T extends QueueTrack>(history: T[], played: T | null): T[] {
  if (!played) return history;
  const grown = [...history, played];
  return grown.length > HISTORY_LIMIT ? grown.slice(grown.length - HISTORY_LIMIT) : grown;
}

/** Everything after the current track, in play order. */
export function upcomingOrder<T extends QueueTrack>(state: QueueState<T>): T[] {
  return [...state.userQueue, ...state.upcoming, ...state.autoplay];
}

/**
 * What the native player must hold after the current track: the play order
 * without the tracks that cannot play (offline: not downloaded, E1). They
 * stay in the model and come back once playable again.
 */
export function playableOrder<T extends QueueTrack>(state: QueueState<T>, isPlayable: (t: T) => boolean = () => true): T[] {
  return upcomingOrder(state).filter(isPlayable);
}

export function isCurrentTrack<T extends QueueTrack>(state: QueueState<T>, trackId: string): boolean {
  return state.current?.id === trackId;
}

/** Same playlist / album / … as the one playing (A10). */
export function isSameSource<T extends QueueTrack>(state: QueueState<T>, source: PlaySource): boolean {
  return !!state.source && state.source.type === source.type && state.source.id === source.id && !!source.id;
}

/**
 * Starts a context (A1-A8, A11). The current track joins the history, the
 * "added by you" zone is kept and plays before the new context.
 * `isPlayable` filters out tracks that cannot play (offline, E1).
 */
export function startContext<T extends QueueTrack>(
  state: QueueState<T>,
  context: PlayContext<T>,
  modes: Modes,
  rng: Rng,
  isPlayable: (t: T) => boolean = () => true,
): QueueState<T> {
  const tracks = context.tracks.filter(isPlayable);
  const base: QueueState<T> = {
    ...state,
    source: context.source,
    contextTracks: tracks,
    history: pushHistory(state.history, state.current),
    autoplay: [],
  };
  if (tracks.length === 0) return {...base, current: null, upcoming: []};

  // A8: a search result plays alone, autoplay follows.
  if (context.source.type === 'search') {
    const picked = tracks.find(t => t.id === context.startTrackId) ?? tracks[0];
    return {...base, contextTracks: [picked], current: picked, upcoming: []};
  }

  const startIndex = context.startTrackId ? tracks.findIndex(t => t.id === context.startTrackId) : -1;

  if (modes.shuffle === 'off') {
    // A1 / A4: in order; tracks before the tapped one go to the history.
    const index = Math.max(0, startIndex);
    return {
      ...base,
      history: [...base.history, ...tracks.slice(0, index)].slice(-HISTORY_LIMIT),
      current: tracks[index],
      upcoming: tracks.slice(index + 1),
    };
  }

  // Shuffle on / magic (A7: albums too).
  if (startIndex >= 0) {
    // A5 / A6: the tapped track first, then the rest shuffled.
    const rest = tracks.filter((_, i) => i !== startIndex);
    return {...base, current: tracks[startIndex], upcoming: shuffle(rest, rng)};
  }
  // A2 / A3: fully shuffled, first track included.
  const mixed = shuffle(tracks, rng);
  return {...base, current: mixed[0], upcoming: mixed.slice(1)};
}

/**
 * Inserts Magic suggestions: one after every `MAGIC_EVERY` context tracks,
 * leftovers at the end (A3, B4). Existing suggestions are replaced, the
 * order of the context tracks is kept (no reshuffle).
 */
export function interleaveMagic<T extends QueueTrack>(upcoming: T[], suggestions: T[]): T[] {
  const context = upcoming.filter(t => !t.isMagic);
  const known = new Set(context.map(t => t.id));
  const magic = suggestions.filter(t => !known.has(t.id)).map(t => ({...t, isMagic: true}));
  const out: T[] = [];
  let m = 0;
  context.forEach((t, i) => {
    out.push(t);
    if ((i + 1) % MAGIC_EVERY === 0 && m < magic.length) out.push(magic[m++]);
  });
  return out.concat(magic.slice(m));
}

/**
 * Changes the shuffle mode while playing (B1-B5, D3). The current track
 * keeps playing and the "added by you" zone is never touched.
 */
export function setShuffle<T extends QueueTrack>(state: QueueState<T>, mode: ShuffleMode, rng: Rng): QueueState<T> {
  if (mode === 'on') {
    // B1: only the tracks to come are shuffled (Magic → on also drops suggestions).
    return {...state, upcoming: shuffle(state.upcoming.filter(t => !t.isMagic), rng)};
  }
  if (mode === 'magic') {
    // B4: suggestions come later through interleaveMagic, without reshuffling.
    return state;
  }
  // B2 / B3 / B5: back to the original order after the last context track
  // actually played; every suggestion to come is dropped.
  const played = [...state.history, ...(state.current ? [state.current] : [])].reverse();
  const anchor = played.find(t => !t.isMagic && !t.isAutoplay && state.contextTracks.some(c => c.id === t.id));
  const index = anchor ? state.contextTracks.findIndex(t => t.id === anchor.id) : -1;
  return {...state, upcoming: state.contextTracks.slice(index + 1)};
}

/** "Play next" (D1): head of the "added by you" zone. */
export function playNextTrack<T extends QueueTrack>(state: QueueState<T>, track: T): QueueState<T> {
  return {...state, userQueue: [track, ...state.userQueue]};
}

/** "Add to queue" (D2): end of the "added by you" zone, before the context. */
export function addToQueue<T extends QueueTrack>(state: QueueState<T>, track: T): QueueState<T> {
  return {...state, userQueue: [...state.userQueue, track]};
}

/** Removes entries to come by entry key, never by position (D4). */
export function removeById<T extends QueueTrack>(state: QueueState<T>, keys: readonly string[]): QueueState<T> {
  const keep = (t: T) => !keys.includes(entryKey(t));
  return {...state, userQueue: state.userQueue.filter(keep), upcoming: state.upcoming.filter(keep), autoplay: state.autoplay.filter(keep)};
}

type Zone = 'userQueue' | 'upcoming' | 'autoplay';
const ZONES: Zone[] = ['userQueue', 'upcoming', 'autoplay'];

/** A track takes the role of the zone it lands in. */
function joinZone<T extends QueueTrack>(t: T, zone: Zone): T {
  const rest: T = {...t};
  delete rest.isMagic;
  delete rest.isAutoplay;
  if (zone === 'autoplay') rest.isAutoplay = true;
  else if (zone === 'upcoming' && t.isMagic) rest.isMagic = true;
  return rest;
}

/**
 * Moves an entry to come before `beforeId` (null = the very end), by entry
 * key (D4). The list may cross zones: the track then belongs to the zone it
 * lands in (dropped among "added by you", it becomes one of them).
 */
export function moveById<T extends QueueTrack>(state: QueueState<T>, id: string, beforeId: string | null): QueueState<T> {
  if (id === beforeId) return state;
  const from = ZONES.find(z => state[z].some(t => entryKey(t) === id));
  if (!from) return state;
  const fromIndex = state[from].findIndex(t => entryKey(t) === id);
  const moved = state[from][fromIndex];
  const without: QueueState<T> = {...state, [from]: state[from].filter((_, i) => i !== fromIndex)};

  let target: Zone;
  let index: number;
  if (beforeId === null) {
    target = [...ZONES].reverse().find(z => without[z].length > 0) ?? from;
    index = without[target].length;
  } else {
    const found = ZONES.find(z => without[z].some(t => entryKey(t) === beforeId));
    if (!found) return state;
    target = found;
    index = without[target].findIndex(t => entryKey(t) === beforeId);
  }
  const zone = without[target];
  return {...without, [target]: [...zone.slice(0, index), joinZone(moved, target), ...zone.slice(index)]};
}

/** "Clear queue": everything to come goes, the current track stays. */
export function clearQueue<T extends QueueTrack>(state: QueueState<T>): QueueState<T> {
  return {...state, userQueue: [], upcoming: [], autoplay: []};
}

/** Stores autoplay suggestions (never in repeat all, C8). */
export function setAutoplay<T extends QueueTrack>(state: QueueState<T>, suggestions: T[], modes: Modes): QueueState<T> {
  if (!modes.autoplay || modes.repeat === 'all') return state;
  return {...state, autoplay: suggestions.map(t => ({...t, isAutoplay: true}))};
}

/** Autoplay turned off: its suggestions leave the queue; what you chose stays. */
export function clearAutoplay<T extends QueueTrack>(state: QueueState<T>): QueueState<T> {
  return state.autoplay.length === 0 ? state : {...state, autoplay: []};
}

/** Autoplay should be fetched: nothing left to play after the current track (C7). */
export function needsAutoplay<T extends QueueTrack>(state: QueueState<T>, modes: Modes): boolean {
  return modes.autoplay && modes.repeat !== 'all' && !!state.current && upcomingOrder(state).length === 0;
}

export type NextResult<T extends QueueTrack> = {state: QueueState<T>; ended: boolean};

/**
 * Moves to the next track (manual Next or end of a track). Order: added by
 * you, then the context, then autoplay. Repeat one does not block a manual
 * Next (C4). At the very end: repeat all restarts the context, reshuffled
 * if shuffle is on (C6); otherwise the last track stays, paused (C7).
 * Tracks that cannot play (offline, E1) are skipped.
 */
export function next<T extends QueueTrack>(
  state: QueueState<T>,
  modes: Modes,
  rng: Rng,
  isPlayable: (t: T) => boolean = () => true,
): NextResult<T> {
  let result = nextOnce(state, modes, rng);
  // E1: tracks that cannot play are passed over silently, without joining the history.
  const limit = upcomingOrder(state).length + state.contextTracks.length + 1;
  for (let i = 0; i < limit && !result.ended && result.state.current && !isPlayable(result.state.current); i++) {
    result = nextOnce({...result.state, current: null}, modes, rng);
  }
  if (result.ended || !result.state.current || !isPlayable(result.state.current)) return {state, ended: true};
  return result;
}

function nextOnce<T extends QueueTrack>(state: QueueState<T>, modes: Modes, rng: Rng): NextResult<T> {
  const history = pushHistory(state.history, state.current);
  if (state.userQueue.length > 0) {
    return {state: {...state, history, current: state.userQueue[0], userQueue: state.userQueue.slice(1)}, ended: false};
  }
  if (state.upcoming.length > 0) {
    return {state: {...state, history, current: state.upcoming[0], upcoming: state.upcoming.slice(1)}, ended: false};
  }
  if (modes.repeat === 'all' && state.contextTracks.length > 0) {
    const round = modes.shuffle === 'off' ? state.contextTracks : shuffle(state.contextTracks, rng);
    return {state: {...state, history, current: round[0], upcoming: round.slice(1), autoplay: []}, ended: false};
  }
  if (state.autoplay.length > 0) {
    return {state: {...state, history, current: state.autoplay[0], autoplay: state.autoplay.slice(1)}, ended: false};
  }
  return {state, ended: true};
}

export type PreviousResult<T extends QueueTrack> = {state: QueueState<T>; restart: boolean};

/**
 * "Previous" (C1-C3): restarts the track after 3 s (unless the "always
 * previous" setting is on) or when there is no history; otherwise goes back
 * in the order actually played. The current track becomes the next one again.
 */
export function previous<T extends QueueTrack>(
  state: QueueState<T>,
  positionSeconds: number,
  alwaysPrevious: boolean,
): PreviousResult<T> {
  const restart = (!alwaysPrevious && positionSeconds > PREVIOUS_RESTART_SECONDS) || state.history.length === 0;
  if (restart || !state.current) return {state, restart: true};
  const back = state.history[state.history.length - 1];
  return {
    state: {
      ...state,
      history: state.history.slice(0, -1),
      current: back,
      upcoming: [state.current, ...state.upcoming],
    },
    restart: false,
  };
}
