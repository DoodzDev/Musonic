/**
 * @file AudioEngine.tsx
 * @description The one browser <audio> element and its controls (play/pause,
 *   previous, seek, volume), shared by the player bar, the full-screen player
 *   and the floating mini player. Publishes the playback position (lyrics),
 *   obeys seek requests, handles the keyboard shortcuts and the system media
 *   controls (media keys, desktop media widget), reports plays to the server
 *   (useScrobbler). Podcast episodes resume where the account stopped, save
 *   their position and may play faster. Components read the controls
 *   with `useTransport` (transport.ts).
 * @author DoodzProg
 * @version 0.3.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { usePlayer } from './PlayerContext.tsx';
import { onSeekRequest, publishPosition, takeStartAt, takeStartPaused } from './position.ts';
import { handleShortcut, TransportContext, type Transport } from './transport.ts';
import { registerSleepPause, takeEndOfTrack } from './sleepTimer.ts';
import { useScrobbler } from './useScrobbler.ts';
import { isEpisode, SPEEDS } from '../lib/podcasts.ts';

const VOLUME_KEY = 'musonic.volume';
const SPEED_KEY = 'musonic.podcastSpeed';
/** How often an episode's position is saved while it plays. */
const SAVE_EVERY_S = 10;

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
  const audioRef = useRef<HTMLAudioElement>(null);
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

  useEffect(() => registerSleepPause(() => audioRef.current?.pause()), []);

  // Load and start the track whenever the current queue entry changes.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !song) return;
    setFailed(false);
    publishPosition(0);
    setDuration(song.duration ?? 0);
    // A transfer (Musonic Connect) resumes where the other device was; an episode where the account stopped.
    pendingSeek.current = takeStartAt() ?? (isEpisode(song.id) ? (song.position ?? 0) / 1000 : 0);
    savedAt.current = pendingSeek.current;
    audio.src = client.streamUrl(song.id);
    audio.playbackRate = isEpisode(song.id) ? speed : 1;
    if (takeStartPaused()) {
      setPlaying(false);
      return;
    }
    if (Date.now() - holdNext.current < 2000) {
      holdNext.current = 0;
      setPlaying(false);
      return;
    }
    audio.play().catch(() => setPlaying(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, entry, setPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
    try {
      localStorage.setItem(VOLUME_KEY, String(volume));
    } catch {
      // Volume is a convenience: losing it is harmless.
    }
  }, [volume, muted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = episode ? speed : 1;
    try {
      localStorage.setItem(SPEED_KEY, String(speed));
    } catch {
      // A convenience, as the volume.
    }
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
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => setPlaying(false));
  }

  const transport: Transport = {
    duration,
    failed,
    volume,
    muted,
    togglePlay() {
      const audio = audioRef.current;
      if (!audio || !song) return;
      if (audio.paused) audio.play().catch(() => setPlaying(false));
      else audio.pause();
    },
    previous() {
      const audio = audioRef.current;
      if (!audio) return;
      if (player.previous(audio.currentTime)) restart();
    },
    seek(seconds) {
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = seconds;
      publishPosition(seconds);
    },
    setVolume,
    setMuted,
    speed,
    cycleSpeed() {
      setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length] ?? 1);
    },
    skipBy(seconds) {
      const audio = audioRef.current;
      if (!audio) return;
      const target = Math.max(0, Math.min(audio.currentTime + seconds, Number.isFinite(audio.duration) ? audio.duration : Infinity));
      audio.currentTime = target;
      publishPosition(target);
    },
  };
  // Event listeners registered once read the latest controls through this ref.
  const latest = useRef({ transport, player });
  useLayoutEffect(() => {
    latest.current = { transport, player };
  });

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

  return (
    <TransportContext.Provider value={transport}>
      <audio
        ref={audioRef}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={(e) => {
          setPlaying(false);
          scrobbler.interrupt();
          savePosition(e.currentTarget.currentTime);
        }}
        onLoadedMetadata={(e) => {
          if (pendingSeek.current > 0) e.currentTarget.currentTime = pendingSeek.current;
          pendingSeek.current = 0;
        }}
        onSeeking={() => scrobbler.interrupt()}
        onTimeUpdate={(e) => {
          publishPosition(e.currentTarget.currentTime);
          if (!e.currentTarget.paused) scrobbler.progress(e.currentTarget.currentTime);
          if (episode && Math.abs(e.currentTarget.currentTime - savedAt.current) >= SAVE_EVERY_S) savePosition(e.currentTarget.currentTime);
        }}
        onDurationChange={(e) => {
          const seconds = e.currentTarget.duration;
          if (!Number.isFinite(seconds)) return;
          setDuration(seconds);
          scrobbler.setDuration(seconds);
        }}
        onEnded={(e) => {
          scrobbler.ended();
          savePosition(e.currentTarget.duration || e.currentTarget.currentTime);
          const stop = takeEndOfTrack();
          holdNext.current = stop ? Date.now() : 0;
          const replay = player.trackEnded();
          if (replay && stop) {
            holdNext.current = 0;
            setPlaying(false);
          } else if (replay) restart();
        }}
        onError={() => song && setFailed(true)}
      />
      {children}
    </TransportContext.Provider>
  );
}
