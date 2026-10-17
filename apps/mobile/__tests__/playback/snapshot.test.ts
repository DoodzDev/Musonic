/**
 * @file snapshot.test.ts
 * @description Unit tests of the queue snapshot (R4.0c): no URL is ever
 *   saved, and a snapshot from another account or format is ignored.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
jest.mock('../../src/store/storage', () => {
  const data = new Map<string, string>();
  return {
    storage: {
      set: (k: string, v: string) => data.set(k, v),
      getString: (k: string) => data.get(k),
      delete: (k: string) => data.delete(k),
    },
  };
});

import {emptyQueue, type QueueState} from '../../src/services/playback/buildQueue';
import {
  SNAPSHOT_VERSION,
  clearSnapshot,
  flushQueueSave,
  loadPosition,
  loadQueue,
  parseSnapshot,
  savePosition,
  scheduleQueueSave,
  serializeSnapshot,
  stripUrls,
} from '../../src/services/playback/snapshot';

type T = {id: string; title: string; url?: string; streamUrl?: string; artwork?: string; coverArt?: string};

const secretUrl = (id: string) => `https://music.example/rest/stream.view?id=${id}&u=me&p=secret`;
const track = (id: string): T => ({
  id,
  title: `Title ${id}`,
  url: secretUrl(id),
  streamUrl: secretUrl(id),
  artwork: `https://music.example/rest/getCoverArt.view?id=${id}&p=secret`,
  coverArt: `al-${id}`,
});

function sample(): QueueState<T> {
  return {
    ...emptyQueue<T>(),
    source: {type: 'playlist', id: 'pl1', name: 'Mix'},
    contextTracks: [track('a'), track('b'), track('c')],
    history: [track('a')],
    current: track('b'),
    userQueue: [track('u')],
    upcoming: [track('c')],
    autoplay: [track('x')],
  };
}

const hydrate = (t: T): T => ({...t, url: `rebuilt-${t.id}`});

describe('queue snapshot', () => {
  beforeEach(() => clearSnapshot());

  test('never saves a URL that carries credentials', () => {
    const raw = serializeSnapshot(sample(), 'acc1');
    expect(raw).not.toContain('secret');
    expect(raw).not.toContain('http');
    expect(raw).toContain('al-b'); // cover id kept to rebuild the artwork
  });

  test('drops a player content URI, valid only in the process that made it', () => {
    const t = {...track('a'), artwork: 'content://com.musonic.artwork/track_a'};
    expect(stripUrls(t).artwork).toBeUndefined();
  });

  test('keeps a local artwork path, which holds no secret', () => {
    const t = {...track('a'), artwork: 'file:///data/covers/a.jpg'};
    expect(stripUrls(t).artwork).toBe('file:///data/covers/a.jpg');
    expect(stripUrls(t).url).toBeUndefined();
  });

  test('restores every zone in order and rebuilds the URLs', () => {
    const restored = parseSnapshot(serializeSnapshot(sample(), 'acc1'), 'acc1', hydrate);
    expect(restored?.source).toEqual({type: 'playlist', id: 'pl1', name: 'Mix'});
    expect(restored?.current?.id).toBe('b');
    expect(restored?.current?.url).toBe('rebuilt-b');
    expect(restored?.history.map(t => t.id)).toEqual(['a']);
    expect(restored?.userQueue.map(t => t.id)).toEqual(['u']);
    expect(restored?.upcoming.map(t => t.id)).toEqual(['c']);
    expect(restored?.autoplay.map(t => t.id)).toEqual(['x']);
    expect(restored?.contextTracks.map(t => t.id)).toEqual(['a', 'b', 'c']);
  });

  test("ignores another account's snapshot", () => {
    expect(parseSnapshot(serializeSnapshot(sample(), 'acc1'), 'acc2', hydrate)).toBeNull();
  });

  test('ignores another format version, a broken or an empty snapshot', () => {
    const other = JSON.stringify({version: SNAPSHOT_VERSION + 1, accountId: 'acc1', state: sample()});
    expect(parseSnapshot(other, 'acc1', hydrate)).toBeNull();
    expect(parseSnapshot('{not json', 'acc1', hydrate)).toBeNull();
    expect(parseSnapshot(undefined, 'acc1', hydrate)).toBeNull();
    const noCurrent = serializeSnapshot({...sample(), current: null}, 'acc1');
    expect(parseSnapshot(noCurrent, 'acc1', hydrate)).toBeNull();
  });

  test('groups saves and writes the latest state on flush', () => {
    scheduleQueueSave(sample(), 'acc1');
    scheduleQueueSave({...sample(), current: track('c')}, 'acc1');
    expect(loadQueue('acc1', hydrate)).toBeNull(); // not written yet
    flushQueueSave();
    expect(loadQueue('acc1', hydrate)?.current?.id).toBe('c');
  });

  test('an empty queue clears the saved one', () => {
    scheduleQueueSave(sample(), 'acc1');
    flushQueueSave();
    scheduleQueueSave(emptyQueue<T>(), 'acc1');
    flushQueueSave();
    expect(loadQueue('acc1', hydrate)).toBeNull();
  });

  test('a position only applies to the track it was saved for', () => {
    savePosition('b', 90);
    expect(loadPosition('b')).toBe(90);
    expect(loadPosition('c')).toBe(0);
  });
});
