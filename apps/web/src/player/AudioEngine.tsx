/**
 * @file AudioEngine.tsx
 * @description The browser audio of the player and its controls (play/pause,
 *   previous, seek, volume), shared by the player bar, the full-screen player
 *   and the floating mini player. Two <audio> elements take turns so the next
 *   track can fade in over the end of the current one (crossfade, rule E3 in
 *   @musonic/core); the current one stays shown until it ends, then the queue
 *   moves to the track already playing. Everything else follows the active
 *   one. Publishes the
 *   playback position (lyrics), obeys seek requests, handles the keyboard
 *   shortcuts and the system media controls (media keys, desktop media
 *   widget), reports plays to the server (useScrobbler). Podcast episodes
 *   resume where the account stopped, save their position, may play faster
 *   and never crossfade. Musonic Connect may ask the next track to start at a
 *   position, or paused. Components read the controls with `useTransport`
 *   (transport.ts).
 * @author DoodzProg
 * @version 0.5.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { crossfadeLength } from '@musonic/core';
import { entryKey, peekNext } from '@musonic/core/playback';
import { useApp } from '../context/AppContext.tsx';
import { equalPowerCurve, getCrossfade } from './crossfade.ts';
import { usePlayer, type WebTrack } from './PlayerContext.tsx';
import { onSeekRequest, publishPosition, takeStartAt, takeStartPaused } from './position.ts';
import { handleShortcut, TransportContext, type Transport } from './transport.ts';
import { isEndOfTrackSet, registerSleepPause, takeEndOfTrack } from './sleepTimer.ts';
import { useScrobbler } from './useScrobbler.ts';
import { isEpisode, SPEEDS } from '../lib/podcasts.ts';

const VOLUME_KEY = 'musonic.volume';
const SPEED_KEY = 'musonic.podcastSpeed';
/** How often an episode's position is saved while it plays. */
const SAVE_EVERY_S = 10;

type Deck = 0 | 1;

/** Web Audio routing of both elements: each one goes through its own gain, used for the fades. */
interface Mixer {
  ctx: AudioContext;
  /** Null until the context runs: an element routed to a suspended context would be silent. */
  gains: [GainNode, GainNode] | null;
}

function readSpeed(): number {
  try {
    const v = Number(localStorage.getItem(SPEED_KEY));
    return SPEEDS.includes(v) ? v : 1;
  } catch {
    return 1;
  }
}

function readVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.8;
  } catch {
    return 0.8;
  }
}

export function AudioEngine({ children }: { children: ReactNode }) {
  const { client } = useApp();
  const player = usePlayer();
  const { current: song, setPlaying } = player;
  const deckA = useRef<HTMLAudioElement>(null);
  const deckB = useRef<HTMLAudioElement>(null);
  const active = useRef<Deck>(0);
  const mixer = useRef<Mixer | null>(null);
  // The next entry fading in on the other element while the current one, still shown, fades out.
  const fade = useRef<{ next: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  // The entry the queue moves to at the end of a fade: already playing, it is not loaded again.
  const handedTo = useRef<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(readVolume);
  const [muted, setMuted] = useState(false);
  const [failed, setFailed] = useState(false);
  const entry = song?.entryId;
  const episode = isEpisode(song?.id);
  // Episodes are not plays of the library.
  const scrobbler = useScrobbler(episode ? undefined : song, entry);
  const [speed, setSpeed] = useState(readSpeed);
  // An episode resumes once its length is known; its position is saved every few seconds.
  const pendingSeek = useRef(0);
  const savedAt = useRef(0);
  // Sleep timer "end of track": the next track (loaded within 2 s of the end) does not start.
  const holdNext = useRef(0);

  const deck = (d: Deck) => (d === 0 ? deckA : deckB).current;
  const audio = () => deck(active.current);
  const other = (): Deck => (active.current === 0 ? 1 : 0);

  /**
   * Routes both elements through Web Audio once a crossfade is on, when a track loads (an
   * element that loaded without CORS would play silent through Web Audio). Left alone while it
   * is off, so playback stays plain <audio>, and servers without CORS headers keep playing.
   */
  function connectMixer() {
    const a = deckA.current;
    const b = deckB.current;
    if (!a || !b || (!mixer.current && getCrossfade() <= 0)) return;
    try {
      const m = mixer.current ?? (mixer.current = { ctx: new AudioContext(), gains: null });
      const build = () => {
        if (m.gains || m.ctx.state !== 'running') return;
        const route = (el: HTMLAudioElement) => {
          const gain = m.ctx.createGain();
          m.ctx.createMediaElementSource(el).connect(gain).connect(m.ctx.destination);
          return gain;
        };
        m.gains = [route(a), route(b)];
      };
      if (m.ctx.state === 'running') build();
      else void m.ctx.resume().then(build, () => {});
    } catch {
      // Web Audio unavailable: tracks simply follow each other.
    }
  }

  function setGain(d: Deck, value: number) {
    const m = mixer.current;
    if (!m?.gains) return;
    const gain = m.gains[d].gain;
    gain.cancelScheduledValues(m.ctx.currentTime);
    gain.setValueAtTime(value, m.ctx.currentTime);
  }

  function rampGain(d: Deck, fadeIn: boolean, seconds: number) {
    const m = mixer.current;
    if (!m?.gains) return;
    const gain = m.gains[d].gain;
    gain.cancelScheduledValues(m.ctx.currentTime);
    gain.setValueCurveAtTime(equalPowerCurve(fadeIn), m.ctx.currentTime, seconds);
  }

  /** Silences and empties an element, back to full volume for its next track. */
  function stopDeck(d: Deck) {
    const el = deck(d);
    if (el) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
    setGain(d, 1);
  }

  /** Near the end of the track: the next entry starts on the other element and fades in as this one fades out. */
  function startFade(next: WebTrack, seconds: number) {
    const el = deck(other());
    if (!el) return;
    el.crossOrigin = 'anonymous';
    el.src = client.streamUrl(next.id);
    el.playbackRate = 1;
    rampGain(other(), true, seconds);
    rampGain(active.current, false, seconds);
    fade.current = { next: entryKey(next), timer: setTimeout(() => latest.current.handOver(), seconds * 1000 + 250) };
    el.play().catch(() => cancelFade());
  }

  /** End of the track fading out: the queue moves to the entry already playing on the other element. */
  function handOver() {
    const f = fade.current;
    if (!f) return;
    fade.current = null;
    clearTimeout(f.timer);
    const from = active.current;
    active.current = other();
    stopDeck(from);
    setGain(active.current, 1);
    scrobbler.ended();
    handedTo.current = f.next;
    player.trackEnded();
  }

  /** Pause, seek or a track chosen by hand during a fade: the next entry is dropped, the current one goes on alone, at full volume. */
  function cancelFade() {
    const f = fade.current;
    if (f) {
      fade.current = null;
      clearTimeout(f.timer);
      stopDeck(other());
    }
    setGain(active.current, 1);
  }

  function startPlay(el: HTMLAudioElement) {
    el.play().catch(() => setPlaying(false));
  }

  useEffect(() => registerSleepPause(() => latest.current.sleepPause()), []);

  // Load and start the track whenever the current queue entry changes.
  useEffect(() => {
    if (!song) return;
    const handed = handedTo.current === entryKey(song);
    handedTo.current = null;
    const el = audio();
    if (handed && el) {
      // Playing since the fade began: only what is shown moves to it.
      setFailed(false);
      publishPosition(el.currentTime);
      setDuration(Number.isFinite(el.duration) ? el.duration : (song.duration ?? 0));
      pendingSeek.current = 0;
      savedAt.current = 0;
      return;
    }
    // Rule E3: a track chosen by hand cuts in, without a fade.
    cancelFade();
    if (!el) return;
    setFailed(false);
    publishPosition(0);
    setDuration(song.duration ?? 0);
    // A transfer (Musonic Connect) resumes where the other device was; an episode where the account stopped.
    pendingSeek.current = takeStartAt() ?? (isEpisode(song.id) ? (song.position ?? 0) / 1000 : 0);
    savedAt.current = pendingSeek.current;
    // CORS only for Web Audio (crossfade): set before the address, as the request depends on it.
    el.crossOrigin = mixer.current || getCrossfade() > 0 ? 'anonymous' : null;
    el.src = client.streamUrl(song.id);
    el.playbackRate = isEpisode(song.id) ? speed : 1;
    connectMixer();
    if (takeStartPaused()) {
      setPlaying(false);
      return;
    }
    if (Date.now() - holdNext.current < 2000) {
      holdNext.current = 0;
      setPlaying(false);
      return;
    }
    startPlay(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, entry, setPlaying]);

  useEffect(() => {
    for (const el of [deckA.current, deckB.current]) {
      if (!el) continue;
      el.volume = volume;
      el.muted = muted;
    }
    try {
      localStorage.setItem(VOLUME_KEY, String(volume));
    } catch {
      // Volume is a convenience: losing it is harmless.
    }
  }, [volume, muted]);

  useEffect(() => {
    const el = audio();
    if (el) el.playbackRate = episode ? speed : 1;
    try {
      localStorage.setItem(SPEED_KEY, String(speed));
    } catch {
      // A convenience, as the volume.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speed, episode]);

  /** Where the account stopped in the episode playing, for every device (Musonic Server). */
  function savePosition(seconds: number) {
    if (!song || !isEpisode(song.id)) return;
    savedAt.current = seconds;
    client.savePodcastPosition(song.id, seconds * 1000).catch(() => {
      // Saved again a few seconds later.
    });
  }

  function restart() {
    const el = audio();
    if (!el) return;
    cancelFade();
    el.currentTime = 0;
    startPlay(el);
  }

  const transport: Transport = {
    duration,
    failed,
    volume,
    muted,
    togglePlay() {
      const el = audio();
      if (!el || !song) return;
      if (el.paused) startPlay(el);
      else {
        cancelFade();
        el.pause();
      }
    },
    previous() {
      const el = audio();
      if (!el) return;
      if (player.previous(el.currentTime)) restart();
    },
    seek(seconds) {
      const el = audio();
      if (!el) return;
      cancelFade();
      el.currentTime = seconds;
      publishPosition(seconds);
    },
    setVolume,
    setMuted,
    speed,
    cycleSpeed() {
      setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length] ?? 1);
    },
    skipBy(seconds) {
      const el = audio();
      if (!el) return;
      cancelFade();
      const target = Math.max(0, Math.min(el.currentTime + seconds, Number.isFinite(el.duration) ? el.duration : Infinity));
      el.currentTime = target;
      publishPosition(target);
    },
  };
  const sleepPause = () => {
    cancelFade();
    audio()?.pause();
  };
  // Event listeners registered once read the latest controls through this ref.
  const latest = useRef({ transport, player, sleepPause, handOver });
  useLayoutEffect(() => {
    latest.current = { transport, player, sleepPause, handOver };
  });

  // The queue changed during a fade (track removed, moved, shuffle, repeat one): the fade starts again with what now comes next.
  useEffect(() => {
    const f = fade.current;
    const next = peekNext(player.queue, player.modes);
    if (f && (!next || entryKey(next) !== f.next)) cancelFade();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.queue, player.modes]);

  useEffect(() => onSeekRequest((s) => latest.current.transport.seek(s)), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => handleShortcut(event, latest.current.transport, latest.current.player);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // System media controls: media keys and the desktop's media widget.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    const actions: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => latest.current.transport.togglePlay()],
      ['pause', () => latest.current.transport.togglePlay()],
      ['previoustrack', () => latest.current.transport.previous()],
      ['nexttrack', () => latest.current.player.hasNext && latest.current.player.next()],
      ['seekto', (details) => details.seekTime != null && latest.current.transport.seek(details.seekTime)],
    ];
    for (const [action, handler] of actions) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Action not supported by this browser.
      }
    }
    return () => {
      for (const [action] of actions) {
        try {
          session.setActionHandler(action, null);
        } catch {
          // Same as above.
        }
      }
    };
  }, []);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = song
      ? new MediaMetadata({
          title: song.title,
          artist: song.artist ?? '',
          album: song.album ?? '',
          artwork: song.coverArt ? [{ src: client.coverArtUrl(song.coverArt, 600), sizes: '600x600' }] : [],
        })
      : null;
  }, [client, song]);

  // The element fading out only reports its end; the rest follows the active one.
  const isActive = (e: SyntheticEvent<HTMLAudioElement>) => e.currentTarget === audio();
  const handlers = {
    onPlay: (e: SyntheticEvent<HTMLAudioElement>) => isActive(e) && setPlaying(true),
    onPause: (e: SyntheticEvent<HTMLAudioElement>) => {
      // The end of a track fading out is no pause: the next one already plays.
      if (!isActive(e) || (fade.current && e.currentTarget.ended)) return;
      setPlaying(false);
      scrobbler.interrupt();
      savePosition(e.currentTarget.currentTime);
    },
    onLoadedMetadata: (e: SyntheticEvent<HTMLAudioElement>) => {
      if (!isActive(e)) return;
      if (pendingSeek.current > 0) e.currentTarget.currentTime = pendingSeek.current;
      pendingSeek.current = 0;
    },
    onSeeking: (e: SyntheticEvent<HTMLAudioElement>) => isActive(e) && scrobbler.interrupt(),
    onTimeUpdate: (e: SyntheticEvent<HTMLAudioElement>) => {
      if (!isActive(e)) return;
      const el = e.currentTarget;
      publishPosition(el.currentTime);
      if (el.paused) return;
      scrobbler.progress(el.currentTime);
      if (episode && Math.abs(el.currentTime - savedAt.current) >= SAVE_EVERY_S) savePosition(el.currentTime);
      if (fade.current || !mixer.current?.gains) return;
      const length = crossfadeLength({
        // Episodes are listened to: they never fade into what comes next.
        setting: episode ? 0 : getCrossfade(),
        position: el.currentTime,
        duration: Number.isFinite(el.duration) ? el.duration : duration,
        repeat: player.modes.repeat,
        endOfTrack: isEndOfTrackSet(),
        hasNext: player.hasNext,
      });
      if (length === null) return;
      // A shuffled round drawn at random, or an episode (it resumes where it stopped): played after, as usual.
      const next = peekNext(player.queue, player.modes);
      if (next && !isEpisode(next.id)) startFade(next, length);
    },
    onDurationChange: (e: SyntheticEvent<HTMLAudioElement>) => {
      if (!isActive(e)) return;
      const seconds = e.currentTarget.duration;
      if (!Number.isFinite(seconds)) return;
      setDuration(seconds);
      scrobbler.setDuration(seconds);
    },
    onEnded: (e: SyntheticEvent<HTMLAudioElement>) => {
      if (!isActive(e)) return;
      if (fade.current) return handOver();
      scrobbler.ended();
      savePosition(e.currentTarget.duration || e.currentTarget.currentTime);
      const stop = takeEndOfTrack();
      holdNext.current = stop ? Date.now() : 0;
      const replay = player.trackEnded();
      if (replay && stop) {
        holdNext.current = 0;
        setPlaying(false);
      } else if (replay) restart();
    },
    onError: (e: SyntheticEvent<HTMLAudioElement>) => isActive(e) && song && setFailed(true),
  };

  return (
    <TransportContext.Provider value={transport}>
      <audio ref={deckA} preload="auto" {...handlers} />
      <audio ref={deckB} preload="auto" {...handlers} />
      {children}
    </TransportContext.Provider>
  );
}
