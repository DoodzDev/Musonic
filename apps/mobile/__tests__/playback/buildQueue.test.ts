/**
 * @file buildQueue.test.ts
 * @description Unit tests of the pure playback rules, one per row of the
 *   ADR-009 matrix (A launch, B modes, C navigation, D manual queue,
 *   E special cases). C5 (repeat one at the natural end) and E2-E4 are
 *   engine behaviours, tested with the engine.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {
  addToQueue,
  clearAutoplay,
  clearQueue,
  emptyQueue,
  interleaveMagic,
  isCurrentTrack,
  isSameSource,
  moveById,
  needsAutoplay,
  next,
  playNextTrack,
  previous,
  removeById,
  setAutoplay,
  setShuffle,
  startContext,
  playableOrder,
  upcomingOrder,
  type Modes,
  type QueueState,
  type QueueTrack,
  type Rng,
} from '../../src/services/playback/buildQueue';

type T = QueueTrack & {offline?: boolean};

/** Deterministic generator, so shuffles are repeatable. */
function seeded(seed = 42): Rng {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const track = (id: string, extra: Partial<T> = {}): T => ({id, ...extra});
const list = (...ids: string[]) => ids.map(id => track(id));
const ids = (tracks: readonly T[]) => tracks.map(t => t.id);
const sorted = (values: string[]) => [...values].sort();

const TEN = list('1', '2', '3', '4', '5', '6', '7', '8', '9', '10');
const playlist = {type: 'playlist' as const, id: 'p1', name: 'Chill'};
const OFF: Modes = {shuffle: 'off', repeat: 'none', autoplay: true};
const ON: Modes = {...OFF, shuffle: 'on'};
const MAGIC: Modes = {...OFF, shuffle: 'magic'};

const start = (modes: Modes, startTrackId?: string, from: QueueState<T> = emptyQueue<T>()) =>
  startContext(from, {source: playlist, tracks: TEN, startTrackId}, modes, seeded());

describe('A. Starting playback', () => {
  it('A1 shuffle off + Play: track 1, then the list order', () => {
    const s = start(OFF);
    expect(s.current?.id).toBe('1');
    expect(ids(s.upcoming)).toEqual(['2', '3', '4', '5', '6', '7', '8', '9', '10']);
  });

  it('A2 shuffle on + Play: fully random, first track included', () => {
    const firsts = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(seed =>
      startContext(emptyQueue<T>(), {source: playlist, tracks: TEN}, ON, seeded(seed)).current?.id,
    ));
    expect(firsts.size).toBeGreaterThan(1);
    const s = start(ON);
    expect(sorted([s.current!.id, ...ids(s.upcoming)])).toEqual(sorted(ids(TEN)));
    expect(ids(s.upcoming)).not.toEqual(ids(TEN.filter(t => t.id !== s.current!.id)));
  });

  it('A3 shuffle magic + Play: like A2, then one suggestion every 2 tracks', () => {
    const s = start(MAGIC);
    const withMagic = interleaveMagic(s.upcoming, list('m1', 'm2', 'm3'));
    expect(withMagic[2].isMagic).toBe(true);
    expect(withMagic[5].isMagic).toBe(true);
    expect(withMagic.filter(t => t.isMagic)).toHaveLength(3);
  });

  it('A4 shuffle off + tap: that track, the rest in order, earlier ones in the history', () => {
    const s = start(OFF, '4');
    expect(s.current?.id).toBe('4');
    expect(ids(s.upcoming)).toEqual(['5', '6', '7', '8', '9', '10']);
    expect(ids(s.history)).toEqual(['1', '2', '3']);
  });

  it('A5 shuffle on + tap: that track first, then the rest shuffled (ISS-023)', () => {
    const s = start(ON, '4');
    expect(s.current?.id).toBe('4');
    expect(sorted(ids(s.upcoming))).toEqual(sorted(ids(TEN.filter(t => t.id !== '4'))));
    expect(ids(s.upcoming)).not.toEqual(['1', '2', '3', '5', '6', '7', '8', '9', '10']);
  });

  it('A6 shuffle magic + tap: like A5, plus suggestions', () => {
    const s = start(MAGIC, '4');
    expect(s.current?.id).toBe('4');
    expect(interleaveMagic(s.upcoming, list('m1')).some(t => t.isMagic)).toBe(true);
  });

  it('A7 shuffle on + album: the album is shuffled too', () => {
    const s = startContext(emptyQueue<T>(), {source: {type: 'album', id: 'a1'}, tracks: TEN}, ON, seeded());
    expect(ids([s.current!, ...s.upcoming])).not.toEqual(ids(TEN));
  });

  it('A8 search result: that track alone, autoplay follows', () => {
    const s = startContext(emptyQueue<T>(), {source: {type: 'search'}, tracks: TEN, startTrackId: '7'}, ON, seeded());
    expect(s.current?.id).toBe('7');
    expect(s.upcoming).toEqual([]);
    expect(needsAutoplay(s, ON)).toBe(true);
  });

  it('A9 tapping the track already playing is detected (opens the player)', () => {
    const s = start(OFF, '4');
    expect(isCurrentTrack(s, '4')).toBe(true);
    expect(isCurrentTrack(s, '5')).toBe(false);
  });

  it('A10 Play on the context already playing is detected (play / pause)', () => {
    const s = start(OFF);
    expect(isSameSource(s, playlist)).toBe(true);
    expect(isSameSource(s, {type: 'playlist', id: 'p2'})).toBe(false);
    expect(isSameSource(s, {type: 'search'})).toBe(false);
  });

  it('A11 a new context keeps the "added by you" zone, played first', () => {
    const before = addToQueue(start(OFF), track('mine'));
    const s = startContext(before, {source: {type: 'album', id: 'a1'}, tracks: list('x', 'y')}, OFF, seeded());
    expect(ids(s.userQueue)).toEqual(['mine']);
    expect(ids(upcomingOrder(s))).toEqual(['mine', 'y']);
    expect(s.history.at(-1)?.id).toBe('1');
  });
});

describe('B. Changing modes while playing', () => {
  it('B1 turning shuffle on: the current track continues, only the tracks to come are shuffled', () => {
    const s = setShuffle(start(OFF, '3'), 'on', seeded());
    expect(s.current?.id).toBe('3');
    expect(sorted(ids(s.upcoming))).toEqual(sorted(['4', '5', '6', '7', '8', '9', '10']));
    expect(ids(s.upcoming)).not.toEqual(['4', '5', '6', '7', '8', '9', '10']);
  });

  it('B2 turning shuffle off: the original order resumes after the current track', () => {
    const shuffled = start(ON, '6');
    const s = setShuffle(shuffled, 'off', seeded());
    expect(s.current?.id).toBe('6');
    expect(ids(s.upcoming)).toEqual(['7', '8', '9', '10']);
  });

  it('B3 shuffle off during a Magic track: resumes after the last non-Magic track played (AUD-003/F09)', () => {
    let s = start(OFF, '5');
    s = {...s, upcoming: interleaveMagic(s.upcoming, list('m1'))};
    s = next(s, MAGIC, seeded()).state; // 6
    s = next(s, MAGIC, seeded()).state; // 7
    s = next(s, MAGIC, seeded()).state; // m1
    expect(s.current?.isMagic).toBe(true);
    s = setShuffle(s, 'off', seeded());
    expect(ids(s.upcoming)).toEqual(['8', '9', '10']);
  });

  it('B4 shuffle on → magic: suggestions are inserted without reshuffling', () => {
    const on = start(ON);
    const magic = setShuffle(on, 'magic', seeded());
    const withMagic = interleaveMagic(magic.upcoming, list('m1', 'm2'));
    expect(ids(withMagic.filter(t => !t.isMagic))).toEqual(ids(on.upcoming));
  });

  it('B5 magic → off: every suggestion to come is removed', () => {
    let s = start(MAGIC);
    s = {...s, upcoming: interleaveMagic(s.upcoming, list('m1', 'm2', 'm3'))};
    s = setShuffle(s, 'off', seeded());
    expect(s.upcoming.some(t => t.isMagic)).toBe(false);
  });

  it('B6 changing mode while suggestions load: the last action wins (rules are synchronous)', () => {
    const base = start(ON);
    const a = setShuffle(base, 'magic', seeded());
    const b = setShuffle(a, 'off', seeded());
    expect(b.upcoming.some(t => t.isMagic)).toBe(false);
    expect(ids(b.upcoming)).toEqual(ids(TEN).slice(ids(TEN).indexOf(base.current!.id) + 1));
  });

  it('B7 the shuffle mode is global: a new context uses the current mode', () => {
    const s = startContext(start(ON), {source: {type: 'album', id: 'a1'}, tracks: TEN}, ON, seeded(7));
    expect(ids([s.current!, ...s.upcoming])).not.toEqual(ids(TEN));
  });
});

describe('C. Navigation', () => {
  const played = () => next(start(OFF), OFF, seeded()).state; // current 2, history [1]

  it('C1 after 3 s, Previous restarts the track', () => {
    const r = previous(played(), 12, false);
    expect(r.restart).toBe(true);
    expect(r.state.current?.id).toBe('2');
  });

  it('C1 bis: with "always previous", Previous goes back even after 3 s', () => {
    const r = previous(played(), 12, true);
    expect(r.restart).toBe(false);
    expect(r.state.current?.id).toBe('1');
  });

  it('C2 within 3 s, Previous goes back in the order actually played', () => {
    let s = start(ON);
    const order = [s.current!.id];
    s = next(s, ON, seeded()).state;
    order.push(s.current!.id);
    const r = previous(s, 1, false);
    expect(r.state.current?.id).toBe(order[0]);
    expect(r.state.upcoming[0].id).toBe(order[1]);
  });

  it('C3 first track without history: Previous restarts it', () => {
    const r = previous(start(OFF), 1, false);
    expect(r.restart).toBe(true);
  });

  it('C4 repeat one + Next: moves on, repeat one stays on', () => {
    const modes: Modes = {...OFF, repeat: 'one'};
    const r = next(start(OFF), modes, seeded());
    expect(r.state.current?.id).toBe('2');
    expect(modes.repeat).toBe('one');
  });

  it('C6 repeat all at the end: restarts, in a new order when shuffled', () => {
    const modes: Modes = {...ON, repeat: 'all'};
    let s = start(modes);
    const firstRound = [s.current!.id, ...ids(s.upcoming)];
    for (let i = 0; i < 9; i++) s = next(s, modes, seeded(i + 1)).state;
    const r = next(s, modes, seeded(99));
    expect(r.ended).toBe(false);
    expect(sorted([r.state.current!.id, ...ids(r.state.upcoming)])).toEqual(sorted(ids(TEN)));
    expect([r.state.current!.id, ...ids(r.state.upcoming)]).not.toEqual(firstRound);
  });

  it('C6 bis: repeat all without shuffle restarts in the original order', () => {
    const modes: Modes = {...OFF, repeat: 'all'};
    let s = start(modes, '10');
    const r = next(s, modes, seeded());
    expect(r.state.current?.id).toBe('1');
    s = r.state;
    expect(ids(s.upcoming)).toEqual(['2', '3', '4', '5', '6', '7', '8', '9', '10']);
  });

  it('C7 repeat off at the end: autoplay if any, otherwise stop on the last track', () => {
    const atEnd = start(OFF, '10');
    expect(needsAutoplay(atEnd, OFF)).toBe(true);
    const ended = next(atEnd, OFF, seeded());
    expect(ended.ended).toBe(true);
    expect(ended.state.current?.id).toBe('10');
    const withAuto = setAutoplay(atEnd, list('s1', 's2'), OFF);
    const r = next(withAuto, OFF, seeded());
    expect(r.state.current?.id).toBe('s1');
    expect(r.state.current?.isAutoplay).toBe(true);
  });

  it('C8 repeat all: autoplay never triggers', () => {
    const modes: Modes = {...OFF, repeat: 'all'};
    const atEnd = start(modes, '10');
    expect(needsAutoplay(atEnd, modes)).toBe(false);
    expect(setAutoplay(atEnd, list('s1'), modes).autoplay).toEqual([]);
  });

  it('C9 autoplay turned off: suggestions leave, the rest stays', () => {
    const atEnd = start(OFF, '10');
    const withAuto = setAutoplay(atEnd, list('s1', 's2'), OFF);
    const off = clearAutoplay(withAuto);
    expect(off.autoplay).toEqual([]);
    expect(off.current?.id).toBe('10');
    expect(off.history).toBe(withAuto.history);
    expect(clearAutoplay(atEnd)).toBe(atEnd);
  });
});

describe('D. Manual queue', () => {
  it('D1 "Play next": head of the "added by you" zone', () => {
    let s = addToQueue(start(OFF), track('a'));
    s = playNextTrack(s, track('b'));
    expect(ids(upcomingOrder(s)).slice(0, 3)).toEqual(['b', 'a', '2']);
  });

  it('D2 "Add to queue": end of the "added by you" zone, before the context', () => {
    let s = addToQueue(start(OFF), track('a'));
    s = addToQueue(s, track('b'));
    expect(ids(upcomingOrder(s)).slice(0, 3)).toEqual(['a', 'b', '2']);
    expect(next(s, OFF, seeded()).state.current?.id).toBe('a');
  });

  it('D3 shuffle on or off never reorders the "added by you" zone', () => {
    let s = addToQueue(addToQueue(start(OFF), track('a')), track('b'));
    s = setShuffle(s, 'on', seeded());
    expect(ids(s.userQueue)).toEqual(['a', 'b']);
    s = setShuffle(s, 'off', seeded());
    expect(ids(s.userQueue)).toEqual(['a', 'b']);
  });

  it('D4 reorder and remove by id, never by position', () => {
    let s = addToQueue(start(OFF), track('a'));
    s = moveById(s, '5', '3');
    expect(ids(s.upcoming).slice(0, 4)).toEqual(['2', '5', '3', '4']);
    s = removeById(s, ['a', '7']);
    expect(ids(s.userQueue)).toEqual([]);
    expect(ids(s.upcoming)).not.toContain('7');
    expect(moveById(s, 'missing', '3')).toBe(s);
  });

  it('D4 bis: moving across zones, the track joins the zone it lands in', () => {
    let s = addToQueue(start(OFF, '8'), track('mine'));
    s = setAutoplay(s, list('s1', 's2'), OFF);
    // An autoplay suggestion dropped before "mine" becomes "added by you".
    s = moveById(s, 's2', 'mine');
    expect(ids(s.userQueue)).toEqual(['s2', 'mine']);
    expect(s.userQueue[0].isAutoplay).toBeUndefined();
    // A context track dropped at the very end becomes autoplay.
    s = moveById(s, '9', null);
    expect(ids(s.autoplay)).toEqual(['s1', '9']);
    expect(s.autoplay[1].isAutoplay).toBe(true);
    expect(ids(upcomingOrder(s))).toEqual(['s2', 'mine', '10', 's1', '9']);
  });

  it('D4 ter: a track present twice is moved and removed copy by copy (entry ids)', () => {
    const dup = (entryId: string) => track('x', {entryId});
    let s = startContext(emptyQueue<T>(), {source: playlist, tracks: [track('1'), dup('e1'), track('2'), dup('e2'), track('3')]}, OFF, seeded());
    // The second copy goes to the top; the first one stays where it was.
    s = moveById(s, 'e2', 'e1');
    expect(s.upcoming.map(t => t.entryId ?? t.id)).toEqual(['e2', 'e1', '2', '3']);
    s = removeById(s, ['e1']);
    expect(s.upcoming.map(t => t.entryId ?? t.id)).toEqual(['e2', '2', '3']);
  });

  it('"Clear queue": everything to come goes, the current track stays', () => {
    const s = clearQueue(addToQueue(start(OFF), track('a')));
    expect(s.current?.id).toBe('1');
    expect(upcomingOrder(s)).toEqual([]);
  });
});

describe('E. Special cases', () => {
  it('E1 offline: only playable (downloaded) tracks are queued', () => {
    const tracks = TEN.map((t, i) => ({...t, offline: i % 2 === 0}));
    const s = startContext(emptyQueue<T>(), {source: playlist, tracks}, ON, seeded(), t => !!t.offline);
    expect(sorted([s.current!.id, ...ids(s.upcoming)])).toEqual(sorted(['1', '3', '5', '7', '9']));
  });

  it('E1 bis: nothing playable leaves an empty queue', () => {
    const s = startContext(emptyQueue<T>(), {source: playlist, tracks: TEN}, OFF, seeded(), () => false);
    expect(s.current).toBeNull();
  });

  it('E1 ter: going offline mid-queue, Next skips what cannot play without losing it', () => {
    const downloaded = new Set(['1', '4', '5']);
    const offline = (t: T) => downloaded.has(t.id);
    const s = start(OFF);
    // The native player only gets the downloaded tracks; the model keeps all of them.
    expect(ids(playableOrder(s, offline))).toEqual(['4', '5']);
    expect(ids(upcomingOrder(s))).toHaveLength(9);
    const r = next(s, OFF, seeded(), offline);
    expect(r.state.current?.id).toBe('4');
    // Skipped tracks are not "played": they do not join the history.
    expect(ids(r.state.history)).toEqual(['1']);
    // Back online, what comes after 4 is all there again.
    expect(ids(upcomingOrder(r.state))).toEqual(['5', '6', '7', '8', '9', '10']);
  });

  it('E1 quater: nothing playable left ends the queue, unchanged', () => {
    const s = start(OFF);
    const r = next(s, {...OFF, repeat: 'all'}, seeded(), t => t.id === '1');
    // Repeat all only finds the current track again: playable, so it loops on it.
    expect(r.state.current?.id).toBe('1');
    const none = next(s, OFF, seeded(), () => false);
    expect(none.ended).toBe(true);
    expect(none.state).toBe(s);
  });
});
