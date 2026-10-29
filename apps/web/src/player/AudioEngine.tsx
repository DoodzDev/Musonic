/**
 * @file AudioEngine.tsx
 * @description The browser audio of the player and its controls (play/pause,
 *   previous, seek, volume), shared by the player bar, the full-screen player
 *   and the floating mini player. Two <audio> elements take turns so the next
 *   track can fade in over the end of the current one (crossfade, rule E3 in
 *   @musonic/core); everything else follows the active one. Publishes the
 *   playback position (lyrics), obeys seek requests, handles the keyboard
 *   shortcuts and the system media controls (media keys, desktop media
 *   widget), reports plays to the server (useScrobbler). Components read the
 *   controls with `useTransport` (transport.ts).
 * @author DoodzProg
 * @version 0.3.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { crossfadeLength } from '@musonic/core';
import { useApp } from '../context/AppContext.tsx';
import { equalPowerCurve, getCrossfade } from './crossfade.ts';
import { usePlayer } from './PlayerContext.tsx';
import { onSeekRequest, publishPosition } from './position.ts';
import { handleShortcut, TransportContext, type Transport } from './transport.ts';
import { isEndOfTrackSet, registerSleepPause, takeEndOfTrack } from './sleepTimer.ts';
import { useScrobbler } from './useScrobbler.ts';

const VOLUME_KEY = 'musonic.volume';

type Deck = 0 | 1;

/** Web Audio routing of both elements: each one goes through its own gain, used for the fades. */
interface Mixer {
  ctx: AudioContext;
  /** Null until the context runs: an element routed to a suspended context would be silent. */
  gains: [GainNode, GainNode] | null;
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
  // The track fading out, until it is stopped.
  const fade = useRef<{ from: Deck; timer: ReturnType<typeof setTimeout> } | null>(null);
  // Length of the fade asked for at the end of a track, until the next one loads.
  const pendingFade = useRef<number | null>(null);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(readVolume);
  const [muted, setMuted] = useState(false);
  const [failed, setFailed] = useState(false);
  const entry = song?.entryId;
  const scrobbler = useScrobbler(song, entry);
  // Sleep timer "end of track": the next track (loaded within 2 s of the end) does not start.
  const holdNext = useRef(0);

  const deck = (d: Deck) => (d === 0 ? deckA : deckB).current;
  const audio = () => deck(active.current);

  /**
   * Routes both elements through Web Audio the first time a crossfade is on.
   * Left alone while it is off, so playback stays plain <audio>.
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

  /** Stops the track that was fading out. */
  function finishFade() {
    const f = fade.current;
    if (!f) return;
    fade.current = null;
    clearTimeout(f.timer);
    const old = deck(f.from);
    if (old) {
      old.pause();
      old.removeAttribute('src');
      old.load();
    }
    setGain(f.from, 1);
  }

  /** Pause, seek or a track chosen by hand during a fade: the new track goes on alone, at full volume. */
  function cancelFade() {
    finishFade();
    setGain(active.current, 1);
  }

  function startPlay(el: HTMLAudioElement) {
    connectMixer();
    el.play().catch(() => setPlaying(false));
  }

  // Load and start the track whenever the current queue entry changes.
  useEffect(() => {
    if (!song) return;
    const fadeLength = pendingFade.current;
    pendingFade.current = null;
    if (fadeLength !== null && mixer.current?.gains) {
      finishFade();
      const from = active.current;
      active.current = from === 0 ? 1 : 0;
      rampGain(from, false, fadeLength);
      fade.current = { from, timer: setTimeout(finishFade, fadeLength * 1000 + 250) };
      rampGain(active.current, true, fadeLength);
    } else {
      // Rule E3: a track chosen by hand cuts in, without a fade.
      cancelFade();
    }
    const el = audio();
    if (!el) return;
    setFailed(false);
    publishPosition(0);
    setDuration(song.duration ?? 0);
    el.src = client.streamUrl(song.id);
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
  };
  const sleepPause = () => {
    cancelFade();
    audio()?.pause();
  };
  // Event listeners registered once read the latest controls through this ref.
  const latest = useRef({ transport, player, sleepPause });
  useLayoutEffect(() => {
    latest.current = { transport, player, sleepPause };
  });

  useEffect(() => registerSleepPause(() => latest.current.sleepPause()), []);

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
      if (!isActive(e)) return;
      setPlaying(false);
      scrobbler.interrupt();
    },
    onSeeking: (e: SyntheticEvent<HTMLAudioElement>) => isActive(e) && scrobbler.interrupt(),
    onTimeUpdate: (e: SyntheticEvent<HTMLAudioElement>) => {
      if (!isActive(e)) return;
      const el = e.currentTarget;
      publishPosition(el.currentTime);
      if (el.paused) return;
      scrobbler.progress(el.currentTime);
      if (fade.current || pendingFade.current !== null || !mixer.current?.gains) return;
      const length = crossfadeLength({
        setting: getCrossfade(),
        position: el.currentTime,
        duration: Number.isFinite(el.duration) ? el.duration : duration,
        repeat: player.modes.repeat,
        endOfTrack: isEndOfTrackSet(),
        hasNext: player.hasNext,
      });
      if (length === null) return;
      // The next entry loads on the other element (effect above), which starts the fade.
      pendingFade.current = length;
      scrobbler.ended();
      player.trackEnded();
    },
    onDurationChange: (e: SyntheticEvent<HTMLAudioElement>) => {
      if (!isActive(e)) return;
      const seconds = e.currentTarget.duration;
      if (!Number.isFinite(seconds)) return;
      setDuration(seconds);
      scrobbler.setDuration(seconds);
    },
    onEnded: (e: SyntheticEvent<HTMLAudioElement>) => {
      if (!isActive(e)) return finishFade();
      // A fade was asked for but no new entry came (queue ended meanwhile): end as usual.
      pendingFade.current = null;
      scrobbler.ended();
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
      <audio ref={deckA} preload="auto" crossOrigin="anonymous" {...handlers} />
      <audio ref={deckB} preload="auto" crossOrigin="anonymous" {...handlers} />
      {children}
    </TransportContext.Provider>
  );
}
