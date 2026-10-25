/**
 * @file PlaybackService.ts
 * @description RNTP headless task. Handles remote control events (play, pause,
 *   skip, seek, stop) fired from lock screen / notification buttons while the
 *   app is backgrounded or killed. Track changes and the end of the queue are
 *   forwarded to the playback engine; manual skips are never crossfaded. The
 *   playing position is saved on pause, in the background and every few
 *   seconds, so the queue can be restored at the same place. Stream errors
 *   go to the engine, which skips the unplayable track. Android Auto browsing
 *   and taps (`remote-play-id`) start here too, so they work without the screens.
 * @author DoodzProg
 * @version 1.4.0
 * @license CC-BY-NC-4.0
 */
import {AppState} from 'react-native';
import TrackPlayer, {Event, State} from 'react-native-track-player';
import {useSettingsStore} from '../store/settingsStore';
import {usePlayerStore} from '../store/playerStore';
import {useDownloadStore} from '../store/downloadStore';
import {subsonicGet} from '../api/client';
import {skipNext, skipPrev} from './playerActions';
import {playbackEngine} from './playback/engine';
import {ListenTracker} from '@musonic/core/listen';
import {onSleepTimerTrackChanged} from './sleepTimer';
import {playAutoMediaId, startAndroidAuto} from './auto/androidAuto';

let wasPlayingBeforeDuck = false;
let fadeInTimer: ReturnType<typeof setInterval> | null = null;
let fadeOutTimer: ReturnType<typeof setInterval> | null = null;
let progressPoller: ReturnType<typeof setInterval> | null = null;
let fadeOutStarted = false;

// Subsonic scrobble: "now playing" is sent immediately on track start; the
// "submission" (a real play server-side, forwarded to Last.fm by some servers)
// once the time really listened reaches the Last.fm rule — half the track or
// 4 minutes, never under 30 s — as on the web (`ListenTracker`): skipping to
// the end or seeking forward is not a play.
let scrobbleTrack: {id: string; duration: number} | null = null;
let listen: ListenTracker | null = null;
let scrobblePoller: ReturnType<typeof setInterval> | null = null;

/** Position save interval while playing, in scrobble poller ticks (1 s). */
const POSITION_SAVE_TICKS = 15;
let positionTicks = 0;

async function saveCurrentPosition() {
  try {
    const [track, {position}] = await Promise.all([TrackPlayer.getActiveTrack(), TrackPlayer.getProgress()]);
    if (track?.id != null) playbackEngine.savePosition(String(track.id), position);
  } catch { /* no active track — ignore */ }
}

function resolveScrobbleId(trackId: string): string | undefined {
  if (!trackId.startsWith('ext-')) return trackId;
  // Only scrobble Deezer tracks that were already imported into Navidrome
  // via the stream+poll flow (like/playlist-add) — never force an import
  // just to scrobble.
  return usePlayerStore.getState().localImportedIds[trackId];
}

function stopScrobblePoller() {
  if (scrobblePoller) { clearInterval(scrobblePoller); scrobblePoller = null; }
}

/** Sends the play of the current track once it counts (at most once per track). */
function submitIfListened() {
  const track = scrobbleTrack;
  if (!track || !listen?.takeScrobble()) return;
  const scrobbleId = resolveScrobbleId(track.id);
  if (scrobbleId) subsonicGet('scrobble.view', {id: scrobbleId, submission: true}).catch(() => {});
}

function startScrobblePoller() {
  stopScrobblePoller();
  scrobblePoller = setInterval(async () => {
    try {
      const {position} = await TrackPlayer.getProgress();
      listen?.progress(position);
      submitIfListened();
      if (++positionTicks >= POSITION_SAVE_TICKS && scrobbleTrack) {
        positionTicks = 0;
        playbackEngine.savePosition(scrobbleTrack.id, position);
      }
    } catch { /* no active track — ignore */ }
  }, 1000);
}

/** Track ends or changes: the last stretch may make the play count. */
async function submitScrobbleIfEligible() {
  stopScrobblePoller();
  submitIfListened();
  scrobbleTrack = null;
  listen = null;
}

function clearAll() {
  if (fadeInTimer) { clearInterval(fadeInTimer); fadeInTimer = null; }
  if (fadeOutTimer) { clearInterval(fadeOutTimer); fadeOutTimer = null; }
  if (progressPoller) { clearInterval(progressPoller); progressPoller = null; }
  fadeOutStarted = false;
}

function startFadeIn(durationSeconds: number) {
  const STEPS = 30;
  const intervalMs = (durationSeconds * 1000) / STEPS;
  let step = 0;
  TrackPlayer.setVolume(0).catch(() => {});
  const id = setInterval(() => {
    step++;
    TrackPlayer.setVolume(Math.min(step / STEPS, 1)).catch(() => {});
    if (step >= STEPS) {
      clearInterval(id);
      if (fadeInTimer === id) { fadeInTimer = null; }
    }
  }, intervalMs);
  fadeInTimer = id;
}

function startFadeOut(durationSeconds: number) {
  const STEPS = 30;
  const intervalMs = (durationSeconds * 1000) / STEPS;
  let step = 0;
  const id = setInterval(() => {
    step++;
    TrackPlayer.setVolume(Math.max(1 - step / STEPS, 0)).catch(() => {});
    if (step >= STEPS) {
      clearInterval(id);
      if (fadeOutTimer === id) { fadeOutTimer = null; }
    }
  }, intervalMs);
  fadeOutTimer = id;
}

// getProgress is polled every 500ms, so detecting the fade-out trigger point
// can lag by up to ~0.5s. Without this margin, the fade-out ramp starts late
// and is still mid-ramp (not yet at volume 0) when the track actually ends,
// causing an audible blip at the start of the next track before its own
// fade-in catches up. Triggering slightly early absorbs that worst-case lag.
const POLL_SAFETY_MARGIN_SECONDS = 0.5;

function startProgressPoller(durationSeconds: number) {
  fadeOutStarted = false;
  const id = setInterval(async () => {
    if (fadeOutStarted) { return; }
    try {
      const {position, duration} = await TrackPlayer.getProgress();
      if (
        duration > 0 &&
        duration > durationSeconds * 2 &&
        position >= duration - durationSeconds - POLL_SAFETY_MARGIN_SECONDS
      ) {
        fadeOutStarted = true;
        clearInterval(id);
        if (progressPoller === id) { progressPoller = null; }
        startFadeOut(durationSeconds);
      }
    } catch {
      // getProgress may throw if no track loaded — ignore
    }
  }, 500);
  progressPoller = id;
}

export async function PlaybackService() {
  // Safety net: if the app is backgrounded while a fade is already running
  // (started while foregrounded, then the user switched to Waze mid-fade),
  // force full volume immediately instead of leaving the JS fade timer to
  // possibly get throttled mid-ramp.
  AppState.addEventListener('change', nextState => {
    if (nextState !== 'active' && (fadeInTimer || fadeOutTimer)) {
      clearAll();
      TrackPlayer.setVolume(1).catch(() => {});
    }
    if (nextState === 'background') {
      playbackEngine.flush();
      saveCurrentPosition();
    }
  });

  TrackPlayer.addEventListener(Event.PlaybackState, ({state}) => {
    if (state === State.Paused || state === State.Stopped) saveCurrentPosition();
    if (state === State.Playing) playbackEngine.onPlaying();
  });

  // Unplayable track (stream error): the engine skips it (E4). Only the code
  // is logged: the message may quote the stream URL, which holds credentials.
  TrackPlayer.addEventListener(Event.PlaybackError, ({code}) => {
    console.warn('[playback] error', code);
    playbackEngine.onPlaybackError(code);
  });

  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteNext, () => skipNext());
  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    skipPrev();
  });
  TrackPlayer.addEventListener(Event.RemoteSeek, ({position}) => {
    // A jump is not listening: the next position starts a new stretch.
    listen?.interrupt();
    TrackPlayer.seekTo(position);
  });
  // Android Auto: a track tapped in the car plays its whole list (ADR-015).
  TrackPlayer.addEventListener(Event.RemotePlayId, ({id}) => {
    playAutoMediaId(id).catch(() => console.warn('[auto] play failed'));
  });
  startAndroidAuto();
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
    // Last track in queue finished — no further PlaybackActiveTrackChanged
    // will fire to trigger the submission scrobble, so flush it here.
    submitScrobbleIfEligible();
    // Repeat all with the engine: a new round starts (C6).
    playbackEngine.onQueueEnded();
  });
  TrackPlayer.addEventListener(Event.RemoteDuck, async ({permanent, paused}) => {
    if (permanent || paused) {
      const {state} = await TrackPlayer.getPlaybackState();
      wasPlayingBeforeDuck = state === State.Playing;
      await TrackPlayer.pause();
    } else {
      if (wasPlayingBeforeDuck) await TrackPlayer.play();
      wasPlayingBeforeDuck = false;
    }
  });
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async event => {
    playbackEngine.onActiveTrackChanged(event.track?.id != null ? String(event.track.id) : undefined);
    // Sleep timer set to "end of track": a track just ended (or was skipped).
    if (event.lastTrack) onSleepTimerTrackChanged();
    const manualSkip = playbackEngine.consumeManualSkip();
    await submitScrobbleIfEligible();

    const {crossfadeDuration, isAutoDownloadEnabled} = useSettingsStore.getState();
    clearAll();
    // Crossfade ramps volume via a JS setInterval — Android throttles JS timers
    // hard once the app is backgrounded (e.g. Waze in foreground during a
    // drive), which can leave volume stuck at 0 indefinitely (track keeps
    // playing/advancing natively, just silently). Only fade while foregrounded,
    // where JS timers are reliable; jump straight to full volume otherwise.
    // No fade on a manual Next / Previous: the change is immediate (E3).
    if (crossfadeDuration > 0 && AppState.currentState === 'active' && !manualSkip) {
      startFadeIn(crossfadeDuration);
      startProgressPoller(crossfadeDuration);
    } else {
      TrackPlayer.setVolume(1).catch(() => {});
    }

    if (isAutoDownloadEnabled) {
      try {
        const activeTrack = await TrackPlayer.getActiveTrack();
        if (activeTrack) {
          useDownloadStore.getState().enqueueTrack({
            id: String(activeTrack.id),
            title: String(activeTrack.title ?? ''),
            artist: String(activeTrack.artist ?? ''),
            album: String(activeTrack.album ?? ''),
            coverArt: activeTrack.coverArt ? String(activeTrack.coverArt) : undefined,
            duration: Number(activeTrack.duration ?? 0),
          }, {auto: true});
        }
      } catch { /* silent */ }
    }

    try {
      const activeTrack = await TrackPlayer.getActiveTrack();
      if (activeTrack) {
        const id = String(activeTrack.id);
        const duration = Number(activeTrack.duration ?? 0);
        scrobbleTrack = {id, duration};
        listen = new ListenTracker(duration);
        startScrobblePoller();
        const scrobbleId = resolveScrobbleId(id);
        if (scrobbleId) {
          subsonicGet('scrobble.view', {id: scrobbleId, submission: false}).catch(() => {});
        }
      }
    } catch { /* silent */ }
  });
}
