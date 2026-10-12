/**
 * @file PlayerBar.tsx
 * @description Bottom player bar driving the browser <audio> element.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useRef, useState } from 'react';
import type { Song, SubsonicClient } from '@musonic/core';
import { fr } from '../i18n/fr.ts';
import { formatTime } from '../lib/format.ts';
import { NextIcon, PauseIcon, PlayIcon, VolumeIcon, WarningIcon } from './Icons.tsx';

interface Props {
  client: SubsonicClient;
  queue: Song[];
  index: number;
  onIndexChange: (index: number) => void;
}

const t = fr.player;
const VOLUME_KEY = 'musonic.volume';
/** Same rule as the mobile app: after 3 s, Previous restarts the current track. */
const RESTART_THRESHOLD = 3;

function readVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.8;
  } catch {
    return 0.8;
  }
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

export function PlayerBar({ client, queue, index, onIndexChange }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(readVolume);
  const [muted, setMuted] = useState(false);
  const [failed, setFailed] = useState(false);

  const song = index >= 0 ? queue[index] : undefined;
  const hasNext = index + 1 < queue.length;

  // Load and start the track whenever the selection changes.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !song) return;
    setFailed(false);
    setPosition(0);
    setDuration(song.duration ?? 0);
    audio.src = client.streamUrl(song.id);
    audio.play().catch(() => setPlaying(false));
  }, [client, song]);

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

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio || !song) return;
    if (audio.paused) audio.play().catch(() => setPlaying(false));
    else audio.pause();
  }

  function previous() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.currentTime > RESTART_THRESHOLD || index <= 0) audio.currentTime = 0;
    else onIndexChange(index - 1);
  }

  function next() {
    if (hasNext) onIndexChange(index + 1);
  }

  function seek(value: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setPosition(value);
  }

  // Space toggles playback, Ctrl+Arrows skip, unless the user is typing.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isTyping(event.target)) return;
      if (event.code === 'Space') {
        event.preventDefault();
        togglePlay();
      } else if (event.ctrlKey && event.key === 'ArrowRight') {
        next();
      } else if (event.ctrlKey && event.key === 'ArrowLeft') {
        previous();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const pct = duration > 0 ? (position / duration) * 100 : 0;

  return (
    <footer className="player-bar">
      <audio
        ref={audioRef}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
        onDurationChange={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
        onEnded={() => (hasNext ? onIndexChange(index + 1) : setPlaying(false))}
        onError={() => song && setFailed(true)}
      />
      <div className="player-inner">
        <div className="player-track">
          <span className="cover cover-60">
            {song?.coverArt && <img src={client.coverArtUrl(song.coverArt, 120)} alt="" />}
          </span>
          <span className="item-text">
            <span className="item-title">{song ? song.title : t.idle}</span>
            {song && <span className="item-sub">{song.artist}</span>}
            {failed && (
              <span className="player-error" role="alert"><WarningIcon size={13} /> {t.error}</span>
            )}
          </span>
        </div>

        <div className="player-center">
          <div className="player-controls">
            <button type="button" className="ctrl" onClick={previous} disabled={!song} aria-label={t.previous} title={`${t.previous} (Ctrl ←)`}>
              <NextIcon flip />
            </button>
            <button type="button" className="ctrl ctrl-main" onClick={togglePlay} disabled={!song} aria-label={playing ? t.pause : t.play} title={`${playing ? t.pause : t.play} (Espace)`}>
              {playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
            </button>
            <button type="button" className="ctrl" onClick={next} disabled={!hasNext} aria-label={t.next} title={`${t.next} (Ctrl →)`}>
              <NextIcon />
            </button>
          </div>
          <div className="progress">
            <span className="time time-left">{formatTime(position)}</span>
            <div className="track">
              <div className="track-bg"><div className="track-fill" style={{ width: `${pct}%` }} /></div>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={position}
                onChange={(e) => seek(Number(e.target.value))}
                aria-label={t.position}
                aria-valuetext={`${formatTime(position)} / ${formatTime(duration)}`}
                disabled={!song}
              />
            </div>
            <span className="time">{formatTime(duration)}</span>
          </div>
        </div>

        <div className="player-side">
          <button type="button" className="icon-btn" onClick={() => setMuted(!muted)} aria-label={muted ? t.unmute : t.mute}>
            <VolumeIcon muted={muted || volume === 0} />
          </button>
          <div className="track track-volume">
            <div className="track-bg"><div className="track-fill" style={{ width: `${muted ? 0 : volume * 100}%` }} /></div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              onChange={(e) => {
                setVolume(Number(e.target.value));
                setMuted(false);
              }}
              aria-label={t.volume}
            />
          </div>
        </div>
      </div>
    </footer>
  );
}
