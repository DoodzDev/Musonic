/**
 * @file sleepTimer.test.ts
 * @description Sleep timer: pauses after the chosen time or at the end of the
 *   track, once; cancelling stops it.
 * @author DoodzProg
 * @license CC-BY-NC-4.0
 */
const mockPause = jest.fn(() => Promise.resolve());
const mockSeekTo = jest.fn((_s: number) => Promise.resolve());
// Called through arrows: the mock factory runs before these constants are set.
jest.mock('react-native-track-player', () => ({
  __esModule: true,
  default: {pause: () => mockPause(), seekTo: (s: number) => mockSeekTo(s)},
}));

import {onSleepTimerTrackChanged, secondsLeft, setSleepTimer, useSleepTimerStore} from '../../src/services/sleepTimer';
import {t} from '../../src/i18n/fr';

beforeEach(() => {
  jest.useFakeTimers();
  mockPause.mockClear();
  mockSeekTo.mockClear();
  setSleepTimer(null);
});
afterEach(() => jest.useRealTimers());

describe('sleepTimer', () => {
  it('pauses once the chosen time has passed (1 h 2 min 3 s)', () => {
    setSleepTimer(3723);
    expect(useSleepTimerStore.getState().endsAt).not.toBeNull();
    jest.advanceTimersByTime(3723_000 - 1);
    expect(mockPause).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(mockPause).toHaveBeenCalledTimes(1);
    expect(useSleepTimerStore.getState().endsAt).toBeNull();
  });

  it('cancels: nothing pauses', () => {
    setSleepTimer(30 * 60);
    setSleepTimer(null);
    jest.advanceTimersByTime(60 * 60_000);
    expect(mockPause).not.toHaveBeenCalled();
  });

  it('a new choice replaces the previous one', () => {
    setSleepTimer(60 * 60);
    setSleepTimer(15 * 60);
    jest.advanceTimersByTime(15 * 60_000);
    expect(mockPause).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(60 * 60_000);
    expect(mockPause).toHaveBeenCalledTimes(1);
  });

  it('end of track: stops the next track at its start, once', async () => {
    onSleepTimerTrackChanged();
    expect(mockPause).not.toHaveBeenCalled();
    setSleepTimer('track');
    onSleepTimerTrackChanged();
    await Promise.resolve();
    expect(mockPause).toHaveBeenCalledTimes(1);
    expect(useSleepTimerStore.getState().endOfTrack).toBe(false);
    onSleepTimerTrackChanged();
    expect(mockPause).toHaveBeenCalledTimes(1);
  });

  it('rounds the seconds left up', () => {
    expect(secondsLeft(10_000, 0)).toBe(10);
    expect(secondsLeft(9_001, 0)).toBe(10);
    expect(secondsLeft(-5, 0)).toBe(1);
  });

  it('says a duration plainly', () => {
    expect(t.sleepTimer.duration(45)).toBe('45 s');
    expect(t.sleepTimer.duration(12 * 60)).toBe('12 min');
    expect(t.sleepTimer.duration(90)).toBe('1 min 30 s');
    expect(t.sleepTimer.duration(3600)).toBe('1 h');
    expect(t.sleepTimer.duration(3900)).toBe('1 h 05 min');
    expect(t.sleepTimer.duration(3723)).toBe('1 h 02 min 3 s');
  });
});
