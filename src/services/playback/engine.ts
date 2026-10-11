/**
 * @file engine.ts
 * @description The playback engine (R4.0, ADR-009): the single place that
 *   builds and changes the queue. Screens call `playContext` and the queue
 *   actions; the rules live in `buildQueue` and the engine only applies them.
 *
 *   - Every change runs one at a time in a promise chain (no more races,
 *     ISS-017). Network work (Magic, autoplay) runs outside the chain and is
 *     dropped if the context or the mode changed meanwhile (last action wins).
 *   - The engine keeps the queue model itself and never reads the native
 *     queue back. The native player only holds the current track followed by
 *     what comes next; the history stays in the model.
 *   - While another code path drives the player (screens not migrated yet),
 *     the engine is inactive and leaves the player alone.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import TrackPlayer, {RepeatMode as NativeRepeat} from 'react-native-track-player';
import {setEngineBridge, usePlayerStore, type RepeatModeUI, type ShuffleMode, type Track} from '../../store/playerStore';
import {useSettingsStore} from '../../store/settingsStore';
import {useDownloadStore} from '../../store/downloadStore';
import {fetchAutoplayTracks, toRNTPTrack} from '../playerActions';
import {fetchMagicSuggestions} from './magic';
import * as Q from './buildQueue';

type State = Q.QueueState<Track>;

let state: State = Q.emptyQueue<Track>();
let active = false;
/** Native queue length: current track + what comes next. */
let nativeLength = 0;
let chain: Promise<void> = Promise.resolve();
/** Bumped when pending suggestions become stale (new context, new mode). */
let token = 0;
let autoplayLoading = false;
/** Set by a manual Next / Previous, read once by the service (no crossfade, E3). */
let manualSkip = false;
/** Native calls made by the current action (debug measurements). */
let nativeCalls = 0;

function native<T>(call: Promise<T>): Promise<T> {
  nativeCalls++;
  return call;
}

function run(name: string, task: () => Promise<void>): Promise<void> {
  const next = chain.then(async () => {
    nativeCalls = 0;
    const started = Date.now();
    await task();
    if (__DEV__) console.log(`[engine] ${name}: ${nativeCalls} native calls, ${Date.now() - started} ms`);
  });
  chain = next.catch(e => console.warn(`[engine] ${name} failed`, e));
  return chain;
}

function modes(): Q.Modes {
  const player = usePlayerStore.getState();
  return {
    shuffle: player.shuffleMode,
    repeat: player.repeatMode,
    autoplay: useSettingsStore.getState().isAutoplayEnabled,
  };
}

/** Offline, only downloaded tracks can play (E1). */
function isPlayable(t: Track): boolean {
  if (!useSettingsStore.getState().isOfflineMode) return true;
  return !!useDownloadStore.getState().getLocalPath(String(t.id));
}

/** Mirrors the model into the UI store (queue sheet, mini player…). */
function publish(): void {
  const upcoming = Q.upcomingOrder(state);
  usePlayerStore.setState({
    history: state.history,
    upcoming,
    queue: state.current ? [state.current, ...upcoming] : upcoming,
    originalQueue: state.contextTracks,
    isMiniPlayerVisible: !!state.current,
  });
}

/** Replaces everything after the current track in the native queue (2 calls at most). */
async function replaceUpcomingNative(): Promise<void> {
  if (nativeLength > 1) {
    await native(TrackPlayer.remove(Array.from({length: nativeLength - 1}, (_, i) => i + 1)));
  }
  const rest = Q.upcomingOrder(state);
  if (rest.length > 0) await native(TrackPlayer.add(rest.map(toRNTPTrack)));
  nativeLength = 1 + rest.length;
}

/** Loads the current track first so it starts at once, then the rest. */
async function loadNative(): Promise<void> {
  await native(TrackPlayer.reset());
  if (!state.current) {
    nativeLength = 0;
    return;
  }
  await native(TrackPlayer.add([toRNTPTrack(state.current)]));
  await native(TrackPlayer.play());
  const rest = Q.upcomingOrder(state);
  if (rest.length > 0) await native(TrackPlayer.add(rest.map(toRNTPTrack)));
  nativeLength = 1 + rest.length;
}

function scheduleMagic(): void {
  const expected = token;
  const seeds = state.upcoming.filter(t => !t.isMagic);
  const count = Math.max(1, Math.floor(seeds.length / Q.MAGIC_EVERY));
  usePlayerStore.getState().setFetchingMagic(true);
  fetchMagicSuggestions([...(state.current ? [state.current] : []), ...seeds], count)
    .then(suggestions =>
      run('magic', async () => {
        if (expected !== token || modes().shuffle !== 'magic' || suggestions.length === 0) return;
        state = {...state, upcoming: Q.interleaveMagic(state.upcoming, suggestions)};
        await replaceUpcomingNative();
        publish();
      }),
    )
    .finally(() => usePlayerStore.getState().setFetchingMagic(false));
}

function scheduleAutoplay(): void {
  if (autoplayLoading || !state.current || !Q.needsAutoplay(state, modes())) return;
  autoplayLoading = true;
  const expected = token;
  const seed = state.current;
  const known = new Set([...state.history, seed, ...state.contextTracks].map(t => String(t.id)));
  fetchAutoplayTracks(seed, known)
    .then(suggestions =>
      run('autoplay', async () => {
        if (expected !== token || !Q.needsAutoplay(state, modes())) return;
        state = Q.setAutoplay(state, suggestions, modes());
        const added = state.autoplay;
        if (added.length === 0) return;
        await native(TrackPlayer.add(added.map(toRNTPTrack)));
        nativeLength += added.length;
        publish();
      }),
    )
    .finally(() => {
      autoplayLoading = false;
    });
}

/** After any change: fetch what the queue may be missing. */
function afterChange(magicNeeded = false): void {
  if (magicNeeded && modes().shuffle === 'magic') scheduleMagic();
  scheduleAutoplay();
}

function nativeRepeat(mode: RepeatModeUI): NativeRepeat {
  // Repeat all is handled by the engine (new order each round, C6).
  return mode === 'one' ? NativeRepeat.Track : NativeRepeat.Off;
}

function rememberPlaylist(source: Q.PlaySource): void {
  const store = usePlayerStore.getState();
  if (source.type === 'playlist' && source.id) store.setCurrentPlaylist(source.id, source.name ?? null);
  else store.setCurrentPlaylist(null, null);
}

export const playbackEngine = {
  /** True while the engine drives the player. */
  isActive: (): boolean => active,

  /** Another code path takes over the player (screens not migrated yet). */
  detach(): void {
    active = false;
    token++;
  },

  /** Reads and clears the manual-skip flag (no crossfade on manual skips, E3). */
  consumeManualSkip(): boolean {
    const was = manualSkip;
    manualSkip = false;
    return was;
  },

  /** Single entry point to start playback from a list (A1-A8, A11, E1). */
  playContext(context: Q.PlayContext<Track>): Promise<void> {
    return run('playContext', async () => {
      active = true;
      token++;
      state = Q.startContext(state, context, modes(), Math.random, isPlayable);
      rememberPlaylist(context.source);
      publish();
      await loadNative();
      await native(TrackPlayer.setRepeatMode(nativeRepeat(modes().repeat)));
      afterChange(true);
    });
  },

  next(): Promise<void> {
    if (!active) return TrackPlayer.skipToNext().catch(() => {});
    return run('next', async () => {
      const expected = Q.upcomingOrder(state)[0];
      const result = Q.next(state, modes(), Math.random);
      if (result.ended) return;
      state = result.state;
      manualSkip = true;
      publish();
      if (expected && expected.id === state.current?.id) {
        await native(TrackPlayer.skipToNext());
        await native(TrackPlayer.remove([0]));
        nativeLength--;
      } else {
        // Repeat all: a new round starts.
        await loadNative();
      }
      afterChange();
    });
  },

  /** Previous (C1-C3); `always` skips the 3-second restart rule. */
  previous(always = false): Promise<void> {
    if (!active) return TrackPlayer.skipToPrevious().catch(() => {});
    return run('previous', async () => {
      const {position} = await native(TrackPlayer.getProgress());
      const result = Q.previous(state, position, always);
      if (result.restart) {
        await native(TrackPlayer.seekTo(0));
        return;
      }
      state = result.state;
      manualSkip = true;
      publish();
      await native(TrackPlayer.add([toRNTPTrack(state.current as Track)], 0));
      await native(TrackPlayer.skip(0));
      nativeLength++;
      // The previous current track went back to the context zone, after "added by you".
      if (state.userQueue.length > 0) await replaceUpcomingNative();
    });
  },

  /** The native player moved to another track (end of a track, notification). */
  onActiveTrackChanged(trackId: string | undefined): Promise<void> {
    if (!active || !trackId) return Promise.resolve();
    return run('trackChanged', async () => {
      if (state.current?.id === trackId) return; // our own skip, or repeat one
      const expected = Q.upcomingOrder(state)[0];
      if (!expected || expected.id !== trackId) {
        // Someone else changed the native queue: stop driving it.
        active = false;
        return;
      }
      state = Q.next(state, modes(), Math.random).state;
      publish();
      await native(TrackPlayer.remove([0]));
      nativeLength--;
      afterChange();
    });
  },

  /** The native queue ran out: repeat all starts a new round (C6). */
  onQueueEnded(): Promise<void> {
    if (!active) return Promise.resolve();
    return run('queueEnded', async () => {
      const result = Q.next(state, modes(), Math.random);
      if (result.ended) return;
      state = result.state;
      publish();
      await loadNative();
      afterChange();
    });
  },

  /** Shuffle off / on / magic while playing (B1-B6). */
  setShuffleMode(mode: ShuffleMode): Promise<void> {
    usePlayerStore.getState().setShuffleMode(mode);
    if (!active) return Promise.resolve();
    return run('shuffle', async () => {
      token++;
      state = Q.setShuffle(state, mode, Math.random);
      await replaceUpcomingNative();
      publish();
      afterChange(true);
    });
  },

  /** Applies the repeat mode already stored by the player store. */
  applyRepeat(mode: RepeatModeUI): Promise<void> {
    if (!active) return Promise.resolve();
    return run('repeat', async () => {
      await native(TrackPlayer.setRepeatMode(nativeRepeat(mode)));
      publish();
      afterChange();
    });
  },

  /** "Play next" (D1): kept in order, at the head of "added by you". */
  playNext(tracks: Track[]): Promise<void> {
    return run('playNext', async () => {
      for (const t of [...tracks].reverse()) state = Q.playNextTrack(state, t);
      await replaceUpcomingNative();
      publish();
    });
  },

  /** "Add to queue" (D2): end of "added by you", before the context. */
  addToQueue(tracks: Track[]): Promise<void> {
    return run('addToQueue', async () => {
      for (const t of tracks) state = Q.addToQueue(state, t);
      await replaceUpcomingNative();
      publish();
    });
  },

  remove(ids: string[]): Promise<void> {
    return run('remove', async () => {
      state = Q.removeById(state, ids);
      await replaceUpcomingNative();
      publish();
      afterChange();
    });
  },

  /** Moves a track to come before `beforeId` (null = end of its zone), by id (D4). */
  move(id: string, beforeId: string | null): Promise<void> {
    return run('move', async () => {
      state = Q.moveById(state, id, beforeId);
      await replaceUpcomingNative();
      publish();
    });
  },

  clearQueue(): Promise<void> {
    return run('clearQueue', async () => {
      token++;
      state = Q.clearQueue(state);
      await replaceUpcomingNative();
      publish();
      afterChange();
    });
  },
};

// Lets the player store and playerActions hand queue actions over to the engine.
setEngineBridge(playbackEngine);
