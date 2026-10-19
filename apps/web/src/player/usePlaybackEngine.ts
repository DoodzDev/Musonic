/**
 * @file usePlaybackEngine.ts
 * @description The web playback engine: queue state driven by the shared rules
 *   (start, shuffle / Magic, repeat, previous, autoplay), modes remembered in
 *   the browser. Magic and autoplay suggestions come from similar songs.
 * @author DoodzProg
 * @version 0.2.0
 * @license CC-BY-NC-4.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Song, SubsonicClient } from '@musonic/core';
import {
  addToQueue,
  clearAutoplay,
  clearQueue,
  emptyQueue,
  entryKey,
  interleaveMagic,
  moveById,
  needsAutoplay,
  next,
  playNextTrack,
  previous,
  removeById,
  setAutoplay,
  setShuffle,
  startContext,
  upcomingOrder,
  type Modes,
  type PlaySource,
  type QueueState,
  type RepeatMode,
  type ShuffleMode,
} from '@musonic/core/playback';
import type { PlayerContextValue, SidePanel, WebTrack } from './PlayerContext.tsx';

const MODES_KEY = 'musonic.modes';
const SHUFFLE_CYCLE: ShuffleMode[] = ['off', 'on', 'magic'];
const REPEAT_CYCLE: RepeatMode[] = ['none', 'all', 'one'];
const MAGIC_SUGGESTIONS = 10;
const AUTOPLAY_SUGGESTIONS = 20;

let entrySeq = 0;
const asEntry = (song: Song): WebTrack => ({ ...song, entryId: `${song.id}#${++entrySeq}` });

function readModes(): Modes {
  const fallback: Modes = { shuffle: 'off', repeat: 'none', autoplay: true };
  try {
    const saved = JSON.parse(localStorage.getItem(MODES_KEY) ?? 'null') as Partial<Modes> | null;
    return saved ? { ...fallback, ...saved } : fallback;
  } catch {
    return fallback;
  }
}

/** `playlist:42` → the source the rules understand. */
function toSource(sourceId: string | null): PlaySource {
  if (!sourceId) return { type: 'other' };
  if (sourceId === 'liked') return { type: 'liked', id: 'liked' };
  // A track found by a search plays alone, then autoplay follows (A8).
  if (sourceId === 'search') return { type: 'search' };
  const [type, ...rest] = sourceId.split(':');
  const id = rest.join(':');
  if ((type === 'playlist' || type === 'album' || type === 'artist') && id) return { type, id };
  return { type: 'mix', id: sourceId };
}

export function usePlaybackEngine(client: SubsonicClient | null): PlayerContextValue {
  const [queue, setQueue] = useState<QueueState<WebTrack>>(emptyQueue);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [modes, setModes] = useState<Modes>(readModes);
  const [playing, setPlaying] = useState(false);
  const [panel, setPanel] = useState<SidePanel>(null);
  const modesRef = useRef(modes);
  const queueRef = useRef(queue);
  useEffect(() => {
    modesRef.current = modes;
    queueRef.current = queue;
  }, [modes, queue]);
  const autoplayAsked = useRef<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(MODES_KEY, JSON.stringify(modes));
    } catch {
      // Modes are a convenience: losing them is harmless.
    }
  }, [modes]);

  /** Fetches Magic suggestions around the current track and spreads them in what comes next. */
  const loadMagic = useCallback(
    async (seed: WebTrack | null, contextIds: Set<string>) => {
      if (!client || !seed) return;
      const similar = await client.getSimilarSongs(seed.id, MAGIC_SUGGESTIONS * 2).catch(() => [] as Song[]);
      const picks = similar.filter((s) => !contextIds.has(s.id)).slice(0, MAGIC_SUGGESTIONS);
      if (modesRef.current.shuffle !== 'magic' || picks.length === 0) return;
      const suggestions = picks.map((s) => ({ ...asEntry(s), isMagic: true }));
      setQueue((q) => ({ ...q, upcoming: interleaveMagic(q.upcoming.filter((t) => !t.isMagic), suggestions) }));
    },
    [client],
  );

  // Autoplay: when nothing is left after the current track, queue similar songs.
  useEffect(() => {
    if (!client || !queue.current || !needsAutoplay(queue, modes)) return;
    const key = entryKey(queue.current);
    if (autoplayAsked.current === key) return;
    autoplayAsked.current = key;
    const known = new Set([...queue.history, ...queue.contextTracks].map((t) => t.id));
    client
      .getSimilarSongs(queue.current.id, AUTOPLAY_SUGGESTIONS)
      .then((songs) => {
        const fresh = songs.filter((s) => !known.has(s.id)).map(asEntry);
        if (fresh.length) setQueue((q) => setAutoplay(q, fresh, modesRef.current));
      })
      .catch(() => {});
  }, [client, queue, modes]);

  const playSongs = useCallback<PlayerContextValue['playSongs']>(
    (songs, startIndex, source) => {
      const tracks = songs.map(asEntry);
      const startTrackId = startIndex === undefined ? undefined : songs[startIndex]?.id;
      const started = startContext(queueRef.current, { source: toSource(source), tracks, startTrackId }, modesRef.current, Math.random);
      queueRef.current = started;
      setSourceId(source);
      setQueue(started);
      if (modesRef.current.shuffle === 'magic') void loadMagic(started.current, new Set(tracks.map((t) => t.id)));
    },
    [loadMagic],
  );

  const goNext = useCallback(() => {
    setQueue((q) => {
      const result = next(q, modesRef.current, Math.random);
      if (result.ended) setPlaying(false);
      return result.state;
    });
  }, []);

  return useMemo<PlayerContextValue>(() => {
    const repeatAll = modes.repeat === 'all' && queue.contextTracks.length > 0;
    return {
      queue,
      modes,
      sourceId,
      current: queue.current ?? undefined,
      hasNext: upcomingOrder(queue).length > 0 || repeatAll,
      playing,
      setPlaying,
      playSongs,
      next: goNext,
      previous: (position) => {
        const result = previous(queue, position, false);
        if (!result.restart) setQueue(result.state);
        return result.restart;
      },
      trackEnded: () => {
        if (modes.repeat === 'one') return true;
        goNext();
        return false;
      },
      jumpTo: (key) =>
        setQueue((q) => {
          let state = q;
          const limit = upcomingOrder(q).length;
          for (let i = 0; i < limit && state.current && entryKey(state.current) !== key; i++) {
            const result = next(state, { ...modesRef.current, repeat: 'none' }, Math.random);
            if (result.ended) break;
            state = result.state;
          }
          return state;
        }),
      addToQueue: (song) => setQueue((q) => addToQueue(q, asEntry(song))),
      playNext: (song) => setQueue((q) => playNextTrack(q, asEntry(song))),
      remove: (key) => setQueue((q) => removeById(q, [key])),
      // "After": moved before the target, then the target moved back before it,
      // so a track dropped below the last one of a zone stays in that zone.
      move: (key, targetKey, after) =>
        setQueue((q) => {
          if (key === targetKey) return q;
          const before = moveById(q, key, targetKey);
          return after ? moveById(before, targetKey, key) : before;
        }),
      clearQueue: () => setQueue((q) => clearQueue(q)),
      cycleShuffle: () => {
        const mode = SHUFFLE_CYCLE[(SHUFFLE_CYCLE.indexOf(modes.shuffle) + 1) % SHUFFLE_CYCLE.length];
        setModes((m) => ({ ...m, shuffle: mode }));
        modesRef.current = { ...modesRef.current, shuffle: mode };
        setQueue((q) => setShuffle(q, mode, Math.random));
        if (mode === 'magic') {
          const { current, contextTracks } = queueRef.current;
          void loadMagic(current, new Set(contextTracks.map((t) => t.id)));
        }
      },
      cycleRepeat: () => {
        const mode = REPEAT_CYCLE[(REPEAT_CYCLE.indexOf(modes.repeat) + 1) % REPEAT_CYCLE.length];
        setModes((m) => ({ ...m, repeat: mode }));
        modesRef.current = { ...modesRef.current, repeat: mode };
        if (mode === 'all') setQueue((q) => clearAutoplay(q));
      },
      panel,
      setPanel,
      togglePanel: (name) => setPanel((shown) => (shown === name ? null : name)),
      reset: () => {
        setQueue(emptyQueue());
        setSourceId(null);
        setPlaying(false);
      },
    };
  }, [queue, modes, sourceId, playing, panel, playSongs, goNext, loadMagic]);
}
