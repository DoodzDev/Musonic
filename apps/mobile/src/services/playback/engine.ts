/**
 * @file engine.ts
 * @description The playback engine (R4.0, ADR-009): the single place that
 *   builds and changes the queue. Screens call `playContext` and the queue
 *   actions; the rules live in `buildQueue` and the engine only applies them.
 *
 *   - Every change runs one at a time in a promise chain (no more races,
 *     ISS-017). Network work (Magic, autoplay) runs outside the chain and is
 *     dropped if the context or the mode changed meanwhile (last action wins).
 *   - The engine keeps the queue model itself and only reads the native
 *     queue back to take it over (restore, unexpected track change). The
 *     native player only holds the current track followed by what comes
 *     next; the history stays in the model.
 *   - The engine is the only code path that changes the queue. It is
 *     inactive only while nothing is loaded.
 *   - The model is saved (snapshot.ts) and restored, paused at the saved
 *     position, when the app is reopened.
 *   - Every track entering the queue gets its own entry id, so a track
 *     present twice can be moved or removed copy by copy.
 *   - A track that cannot play is skipped with a discreet toast (E4); after
 *     a few failures in a row (no network) playback stops instead.
 *   - Offline, the native player only holds downloaded tracks; the others
 *     stay in the model and come back online. No Magic nor autoplay (E1).
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import TrackPlayer, {RepeatMode as NativeRepeat} from 'react-native-track-player';
import {setEngineBridge, usePlayerStore, type RepeatModeUI, type ShuffleMode, type Track} from '../../store/playerStore';
import {useSettingsStore} from '../../store/settingsStore';
import {useDownloadStore} from '../../store/downloadStore';
import {AppState} from 'react-native';
import {configureClient, getActiveServer, getCoverArtUrl, getStreamUrl} from '../../api/client';
import {getT} from '../../i18n';
import {toast} from '../../components/ui/Toast';
import {checkNow as checkServerNow} from '../connectivityService';
import {useNetworkStore} from '../../store/networkStore';
import {fetchAutoplayTracks, toRNTPTrack} from '../playerActions';
import {fetchMagicSuggestions} from './magic';
import * as Q from './buildQueue';
import * as Snapshot from './snapshot';

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
let entrySeq = 0;
/**
 * A stream failed for lack of network: until the server answers again, only
 * downloaded tracks can play, even before the app switches offline (E1).
 */
let networkDown = false;
/** Unplayable tracks in a row; reset as soon as a track actually plays (E4). */
let failures = 0;
const MAX_FAILURES = 3;
/** Zones emptied by the last "Clear queue", kept for its Undo. */
let cleared: {currentKey: string; userQueue: Track[]; upcoming: Track[]; autoplay: Track[]} | null = null;
/** Unique even across restarts (restored entries keep their ids). */
const entryPrefix = Date.now().toString(36);

/** A new queue entry for this track. */
function entry(t: Track): Track {
  return {...t, entryId: `${entryPrefix}-${(++entrySeq).toString(36)}`};
}

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

/** Offline or without network, only downloaded tracks can play (E1). */
function isPlayable(t: Track): boolean {
  if (!useSettingsStore.getState().isOfflineMode && !networkDown) return true;
  return !!useDownloadStore.getState().getLocalPath(String(t.id));
}

function accountId(): string | null {
  return useSettingsStore.getState().activeServerId;
}

/** What the native player holds after the current track (offline: downloaded only, E1). */
function nativeOrder(): Track[] {
  return Q.playableOrder(state, isPlayable);
}

function isOffline(): boolean {
  return useSettingsStore.getState().isOfflineMode || networkDown;
}

/** Stream errors caused by the network, not by the track itself. */
function isNetworkError(code: string | undefined): boolean {
  return !!code && code.startsWith('android-io-network');
}

/** Mirrors the model into the UI store (queue sheet, mini player…) and saves it. */
function publish(): void {
  const upcoming = Q.upcomingOrder(state);
  usePlayerStore.setState({
    history: state.history,
    upcoming,
    queue: state.current ? [state.current, ...upcoming] : upcoming,
    originalQueue: state.contextTracks,
    isMiniPlayerVisible: !!state.current,
  });
  const account = accountId();
  if (account) Snapshot.scheduleQueueSave(state, account);
}

/**
 * The API client may not be configured yet when the player is set up (the
 * navigator configures it while rendering): configure it from the settings.
 */
function ensureClient(): boolean {
  if (getActiveServer()) return true;
  const s = useSettingsStore.getState();
  const server = s.servers.find(x => x.id === s.activeServerId);
  if (!server) return false;
  configureClient(server);
  return true;
}

/** Rebuilds the URLs a snapshot leaves out (they carry the credentials). */
function hydrate(t: Track): Track {
  const url = getStreamUrl(t.id);
  const hydrated = {...t, url, streamUrl: url, artwork: t.artwork ?? getCoverArtUrl(t.coverArt || t.id, 300)};
  return t.entryId ? hydrated : entry(hydrated);
}

/** Native track descriptor back to a model track (queue adopted from the player). */
function fromNative(t: any): Track {
  return {
    id: String(t.id ?? ''),
    title: String(t.title ?? ''),
    artist: String(t.artist ?? ''),
    album: String(t.album ?? ''),
    duration: Number(t.duration ?? 0),
    coverArt: t.coverArt ? String(t.coverArt) : undefined,
    artistId: t.artistId,
    url: String(t.url ?? ''),
    streamUrl: String(t.url ?? ''),
    artwork: typeof t.artwork === 'string' && t.artwork ? t.artwork : undefined,
    isMagic: t.isMagic ? true : undefined,
    isAutoplay: t.isAutoplay ? true : undefined,
  };
}

/** Replaces everything after the current track in the native queue (2 calls at most). */
async function replaceUpcomingNative(): Promise<void> {
  if (nativeLength > 1) {
    await native(TrackPlayer.remove(Array.from({length: nativeLength - 1}, (_, i) => i + 1)));
  }
  const rest = nativeOrder();
  if (rest.length > 0) await native(TrackPlayer.add(rest.map(toRNTPTrack)));
  nativeLength = 1 + rest.length;
}

/** Loads the current track first so it starts at once, then the rest. */
async function loadNative(play = true, position = 0): Promise<void> {
  await native(TrackPlayer.reset());
  if (!state.current) {
    nativeLength = 0;
    return;
  }
  await native(TrackPlayer.add([toRNTPTrack(state.current)]));
  if (position > 0) await native(TrackPlayer.seekTo(position));
  if (play) await native(TrackPlayer.play());
  const rest = nativeOrder();
  if (rest.length > 0) await native(TrackPlayer.add(rest.map(toRNTPTrack)));
  nativeLength = 1 + rest.length;
}

/** Takes over a native queue the model does not describe (current = active track). */
async function adoptNative(): Promise<boolean> {
  const [queue, index] = await Promise.all([
    native(TrackPlayer.getQueue()),
    native(TrackPlayer.getActiveTrackIndex()),
  ]);
  if (index == null || !queue[index]) return false;
  const tracks = queue.map(t => entry(fromNative(t)));
  state = {
    ...Q.emptyQueue<Track>(),
    source: {type: 'other'},
    contextTracks: tracks,
    history: tracks.slice(0, index),
    current: tracks[index],
    upcoming: tracks.slice(index + 1),
  };
  await keepFromNative(index, queue.length);
  return true;
}

/** Drops the native tracks before `index`, then puts the model's order after it. */
async function keepFromNative(index: number, length: number): Promise<void> {
  if (index > 0) await native(TrackPlayer.remove(Array.from({length: index}, (_, i) => i)));
  nativeLength = length - index;
  await replaceUpcomingNative();
}

/**
 * After adding tracks: with nothing loaded, the first one becomes the
 * current track, loaded paused (the mini player shows, Play starts it).
 */
async function syncAfterAdd(): Promise<void> {
  if (active && state.current) {
    await replaceUpcomingNative();
    return;
  }
  const result = Q.next(state, modes(), Math.random, isPlayable);
  if (result.ended) return;
  state = result.state;
  active = true;
  token++;
  await loadNative(false);
  await native(TrackPlayer.setRepeatMode(nativeRepeat(modes().repeat)));
}

function scheduleMagic(): void {
  if (isOffline()) return; // E1: no suggestions offline, Magic plays like shuffle on
  const expected = token;
  const seeds = state.upcoming.filter(t => !t.isMagic);
  const count = Math.max(1, Math.floor(seeds.length / Q.MAGIC_EVERY));
  usePlayerStore.getState().setFetchingMagic(true);
  fetchMagicSuggestions([...(state.current ? [state.current] : []), ...seeds], count)
    .then(suggestions =>
      run('magic', async () => {
        if (expected !== token || modes().shuffle !== 'magic' || suggestions.length === 0) return;
        state = {...state, upcoming: Q.interleaveMagic(state.upcoming, suggestions.map(entry))};
        await replaceUpcomingNative();
        publish();
      }),
    )
    .finally(() => usePlayerStore.getState().setFetchingMagic(false));
}

function scheduleAutoplay(): void {
  if (autoplayLoading || isOffline() || !state.current || !Q.needsAutoplay(state, modes())) return;
  autoplayLoading = true;
  const expected = token;
  const seed = state.current;
  const known = new Set([...state.history, seed, ...state.contextTracks].map(t => String(t.id)));
  fetchAutoplayTracks(seed, known)
    .then(suggestions =>
      run('autoplay', async () => {
        if (expected !== token || !Q.needsAutoplay(state, modes())) return;
        state = Q.setAutoplay(state, suggestions.map(entry), modes());
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
  /** True while something is loaded. */
  isActive: (): boolean => active,

  /** Reads and clears the manual-skip flag (no crossfade on manual skips, E3). */
  consumeManualSkip(): boolean {
    const was = manualSkip;
    manualSkip = false;
    return was;
  },

  /**
   * Called once the native player is set up. A player still holding a queue
   * (the service kept playing) is taken over without a cut, using the saved
   * model when it matches. Otherwise the saved queue is loaded, paused at the
   * saved position.
   */
  restore(): Promise<void> {
    return run('restore', async () => {
      const account = accountId();
      if (active || !account || !ensureClient()) return;
      const saved = Snapshot.loadQueue<Track>(account, hydrate);
      const [queue, index] = await Promise.all([
        native(TrackPlayer.getQueue()),
        native(TrackPlayer.getActiveTrackIndex()),
      ]);

      if (index != null && queue[index]) {
        if (saved && saved.current?.id === String(queue[index].id)) {
          state = saved;
          await keepFromNative(index, queue.length);
        } else {
          await adoptNative();
        }
      } else {
        if (!saved) return;
        state = saved;
        await loadNative(false, Snapshot.loadPosition(String(saved.current?.id)));
      }

      active = true;
      token++;
      if (state.source) rememberPlaylist(state.source);
      publish();
      await native(TrackPlayer.setRepeatMode(nativeRepeat(modes().repeat)));
      afterChange();
    });
  },

  /** Saves the playing position (pause, background, every few seconds). */
  savePosition(trackId: string, seconds: number): void {
    if (active && state.current?.id === trackId) Snapshot.savePosition(trackId, seconds);
  },

  /** Writes the pending queue save at once (app going to the background). */
  flush(): void {
    Snapshot.flushQueueSave();
  },

  /** Single entry point to start playback from a list (A1-A8, A11, E1). */
  playContext(context: Q.PlayContext<Track>): Promise<void> {
    return run('playContext', async () => {
      active = true;
      token++;
      state = Q.startContext(state, {...context, tracks: context.tracks.map(entry)}, modes(), Math.random, isPlayable);
      rememberPlaylist(context.source);
      publish();
      await loadNative();
      await native(TrackPlayer.setRepeatMode(nativeRepeat(modes().repeat)));
      afterChange(true);
    });
  },

  next(): Promise<void> {
    if (!active) return Promise.resolve();
    return run('next', async () => {
      const expected = nativeOrder()[0];
      const result = Q.next(state, modes(), Math.random, isPlayable);
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
    if (!active) return Promise.resolve();
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
      const expected = nativeOrder()[0];
      if (!expected || expected.id !== trackId) {
        // The native queue changed outside the engine (car, system): take it over.
        if (await adoptNative()) publish();
        return;
      }
      state = Q.next(state, modes(), Math.random, isPlayable).state;
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
      const result = Q.next(state, modes(), Math.random, isPlayable);
      if (result.ended) return;
      state = result.state;
      publish();
      await loadNative();
      afterChange();
    });
  },

  /** Online / offline switched: the native queue follows what can play (E1). */
  onAvailabilityChanged(): Promise<void> {
    if (!active) return Promise.resolve();
    return run('availability', async () => {
      await replaceUpcomingNative();
      publish();
      afterChange(true);
    });
  },

  /** The server answers again after a stream network error. */
  onNetworkBack(): Promise<void> {
    if (!networkDown) return Promise.resolve();
    networkDown = false;
    return playbackEngine.onAvailabilityChanged();
  },

  /** A track really plays: the unplayable-track counter starts again (E4). */
  onPlaying(): void {
    failures = 0;
  },

  /**
   * The current track cannot play (stream error, E4): skip to the next one
   * with a discreet toast. After `MAX_FAILURES` in a row, or with nothing
   * left, playback stops with an error toast instead. A network error means
   * the network is gone: skip silently to the next downloaded track (E1)
   * and check the server at once.
   */
  onPlaybackError(code?: string): Promise<void> {
    if (!active) return Promise.resolve();
    return run('playbackError', async () => {
      const t = getT().queue;
      const foreground = AppState.currentState === 'active';
      const network = isNetworkError(code);
      if (network) {
        networkDown = true;
        checkServerNow().then(reachable => {
          if (reachable) playbackEngine.onNetworkBack();
        });
      } else {
        failures++;
      }
      const result = Q.next(state, modes(), Math.random, isPlayable);
      if (failures >= MAX_FAILURES || result.ended) {
        failures = 0;
        await native(TrackPlayer.pause());
        if (foreground) toast.error(t.playbackFailedToast);
        return;
      }
      state = result.state;
      manualSkip = true;
      publish();
      // After an error the native player is stuck: reload it from the model.
      await loadNative();
      if (foreground && !network) toast.show(t.unreadableToast);
      afterChange();
    });
  },

  /** Shuffle off / on / magic while playing (B1-B6). */
  setShuffleMode(requested: ShuffleMode): Promise<void> {
    let mode = requested;
    if (mode === 'magic' && isOffline()) {
      // E1: Magic needs the network; the cycle goes on to "off", with a message.
      mode = 'off';
      if (AppState.currentState === 'active') toast.show(getT().queue.magicOfflineToast);
    }
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
      for (const t of [...tracks].reverse()) state = Q.playNextTrack(state, entry(t));
      await syncAfterAdd();
      publish();
    });
  },

  /** "Add to queue" (D2): end of "added by you", before the context. */
  addToQueue(tracks: Track[]): Promise<void> {
    return run('addToQueue', async () => {
      for (const t of tracks) state = Q.addToQueue(state, entry(t));
      await syncAfterAdd();
      publish();
    });
  },

  /** Removes entries to come by entry key. */
  remove(ids: string[]): Promise<void> {
    if (!active) return Promise.resolve();
    return run('remove', async () => {
      state = Q.removeById(state, ids);
      await replaceUpcomingNative();
      publish();
      afterChange();
    });
  },

  /**
   * Moves an entry to come before `beforeId` (null = the very end), by entry key,
   * across zones (D4). The order is published first; the native queue then
   * takes a remove + insert when the new order allows it. Never the native
   * `move`: KotlinAudio 2.1.0 shifts its own queue one slot too high on an
   * upward move, so the reported track no longer matches what plays.
   */
  move(id: string, beforeId: string | null): Promise<void> {
    if (!active) return Promise.resolve();
    return run('move', async () => {
      const before = nativeOrder();
      state = Q.moveById(state, id, beforeId);
      publish();
      const after = nativeOrder();
      const from = before.findIndex(t => Q.entryKey(t) === id);
      const to = after.findIndex(t => Q.entryKey(t) === id);
      const simulated = [...before];
      if (from >= 0) simulated.splice(to, 0, ...simulated.splice(from, 1));
      const singleMove =
        from >= 0 && to >= 0 && nativeLength === 1 + before.length &&
        simulated.length === after.length && simulated.every((t, i) => Q.entryKey(t) === Q.entryKey(after[i]));
      if (!singleMove) {
        await replaceUpcomingNative();
      } else if (from !== to) {
        await native(TrackPlayer.remove([1 + from]));
        await native(TrackPlayer.add([toRNTPTrack(after[to])], 1 + to));
      }
    });
  },

  /** "Clear queue": everything to come goes, the current track stays (Undo: `undoClearQueue`). */
  clearQueue(): Promise<void> {
    if (!active) return Promise.resolve();
    return run('clearQueue', async () => {
      token++;
      if (state.current) {
        cleared = {
          currentKey: Q.entryKey(state.current),
          userQueue: state.userQueue,
          upcoming: state.upcoming,
          autoplay: state.autoplay,
        };
      }
      state = Q.clearQueue(state);
      await replaceUpcomingNative();
      publish();
      afterChange();
    });
  },

  /** Puts back what the last "Clear queue" removed, if the same track is still playing. */
  undoClearQueue(): Promise<void> {
    return run('undoClearQueue', async () => {
      const saved = cleared;
      cleared = null;
      if (!active || !saved || !state.current || Q.entryKey(state.current) !== saved.currentKey) return;
      token++;
      state = {...state, userQueue: saved.userQueue, upcoming: saved.upcoming, autoplay: saved.autoplay};
      await replaceUpcomingNative();
      publish();
    });
  },
};

// Lets the player store and playerActions hand queue actions over to the engine.
setEngineBridge(playbackEngine);

// Online / offline (manual or automatic) changes what the native queue may hold.
useSettingsStore.subscribe((s, prev) => {
  if (s.isOfflineMode !== prev.isOfflineMode) playbackEngine.onAvailabilityChanged();
});
useNetworkStore.subscribe((s, prev) => {
  if (s.serverReachable && !prev.serverReachable) playbackEngine.onNetworkBack();
});
