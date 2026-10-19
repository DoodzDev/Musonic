/**
 * @file AudioEngine.tsx
 * @description The one browser <audio> element and its controls (play/pause,
 *   previous, seek, volume), shared by the player bar, the full-screen player
 *   and the floating mini player. Publishes the playback position (lyrics),
 *   obeys seek requests, handles the keyboard shortcuts and the system media
 *   controls (media keys, desktop media widget). Components read the controls
 *   with `useTransport` (transport.ts).
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { usePlayer } from './PlayerContext.tsx';
import { onSeekRequest, publishPosition } from './position.ts';
import { handleShortcut, TransportContext, type Transport } from './transport.ts';

const VOLUME_KEY = 'musonic.volume';

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

  // Load and start the track whenever the current queue entry changes.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !song) return;
    setFailed(false);
    publishPosition(0);
    setDuration(song.duration ?? 0);
    audio.src = client.streamUrl(song.id);
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
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => publishPosition(e.currentTarget.currentTime)}
        onDurationChange={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
        onEnded={() => {
          if (player.trackEnded()) restart();
        }}
        onError={() => song && setFailed(true)}
      />
      {children}
    </TransportContext.Provider>
  );
}
