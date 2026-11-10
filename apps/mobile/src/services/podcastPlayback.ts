/**
 * @file podcastPlayback.ts
 * @description Podcast episodes (ADR-023) played by the same player as songs:
 *   an episode is a track whose artist is its show, started where the account
 *   stopped (on any device), its place saved every few seconds and at pause.
 *   Speed and short jumps are for episodes only.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import TrackPlayer, {Event, State} from './player';
import {playbackEngine} from './playback/engine';
import {songToTrack} from '../utils/songToTrack';
import {isEpisode, savePodcastPosition, type PodcastEpisode, type PodcastShow} from '../api/endpoints/podcasts';
import {storage} from '../store/storage';
import type {Track} from '../store/playerStore';
import {getT} from '../i18n';
import {notifyJump} from './connect/jumps';

const SAVE_EVERY_MS = 10_000;
const SPEED_KEY = 'podcast-speed';
export const SPEEDS = [1, 1.25, 1.5, 1.75, 2, 0.75];

function published(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, {day: 'numeric', month: 'short', year: 'numeric'});
}

/** « 12 oct. 2026 · Reste 23 min »: when an episode came out and where the account stopped. */
export function episodeSummary(e: PodcastEpisode): string {
  const t = getT().podcasts;
  const minutes = (s: number) => Math.max(1, Math.round(s / 60));
  const state = e.played
    ? t.played
    : e.duration && e.position
      ? t.left(minutes(e.duration - e.position / 1000))
      : e.duration ? t.minutes(minutes(e.duration)) : '';
  return [published(e.publishDate), state].filter(Boolean).join(' · ');
}

export function episodeTrack(episode: PodcastEpisode, show: Pick<PodcastShow, 'title' | 'coverArt'>): Track {
  return songToTrack({
    id: episode.id,
    title: episode.title,
    artist: show.title,
    album: show.title,
    duration: episode.duration,
    coverArt: episode.coverArt ?? show.coverArt,
  });
}

/** Plays one episode, from where the account stopped (from the start once listened to the end). */
export async function playEpisode(episode: PodcastEpisode, show: Pick<PodcastShow, 'title' | 'coverArt'>): Promise<void> {
  await playbackEngine.playContext({source: {type: 'other', name: show.title}, tracks: [episodeTrack(episode, show)]});
  const from = episode.played ? 0 : (episode.position ?? 0) / 1000;
  if (from > 0) await TrackPlayer.seekTo(from).catch(() => {});
}

export function podcastSpeed(): number {
  const saved = storage.getNumber(SPEED_KEY);
  return saved && SPEEDS.includes(saved) ? saved : 1;
}

/** The next speed in the list, applied now when an episode plays. */
export async function cycleSpeed(): Promise<number> {
  const next = SPEEDS[(SPEEDS.indexOf(podcastSpeed()) + 1) % SPEEDS.length] ?? 1;
  storage.set(SPEED_KEY, next);
  const track = await TrackPlayer.getActiveTrack().catch(() => undefined);
  if (isEpisode(track?.id)) await TrackPlayer.setRate(next).catch(() => {});
  return next;
}

export async function skipBy(seconds: number): Promise<void> {
  const {position, duration} = await TrackPlayer.getProgress();
  const target = Math.max(0, duration > 0 ? Math.min(position + seconds, duration - 1) : position + seconds);
  await TrackPlayer.seekTo(target);
  notifyJump();
}

let current: string | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
/**
 * An episode started again after the sound moved (phone → car) may play silent until a seek:
 * one seek on the spot, at its first start, wakes the audio output up.
 */
let wake = false;

async function save(): Promise<void> {
  if (!current) return;
  const {position} = await TrackPlayer.getProgress().catch(() => ({position: 0}));
  if (position > 0) savePodcastPosition(current, position * 1000).catch(() => {});
}

/**
 * Follows the player (once, from the playback service): episodes get their speed and their
 * place saved; songs play at 1×.
 */
export function startPodcastTracking(): void {
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async ({track}) => {
    await save();
    current = isEpisode(track?.id) ? String(track?.id) : null;
    wake = current != null;
    await TrackPlayer.setRate(current ? podcastSpeed() : 1).catch(() => {});
  });
  TrackPlayer.addEventListener(Event.PlaybackState, ({state}) => {
    if (!current) return;
    if (state === State.Playing) {
      if (wake) {
        wake = false;
        TrackPlayer.getProgress()
          .then(({position}) => TrackPlayer.seekTo(position))
          .catch(() => {});
      }
      if (!timer) timer = setInterval(() => { save().catch(() => {}); }, SAVE_EVERY_MS);
    } else {
      if (timer) clearInterval(timer);
      timer = null;
      save().catch(() => {});
    }
  });
}
