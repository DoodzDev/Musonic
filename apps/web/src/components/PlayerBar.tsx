/**
 * @file PlayerBar.tsx
 * @description Bottom player bar driving the browser <audio> element: shuffle
 *   (off / on / Magic) and repeat (none / all / one) like the mobile app,
 *   progress and volume with a knob shown on hover and while dragging, the
 *   volume in percent, and the queue and lyrics panels. Publishes the playback
 *   position (lyrics) and obeys seek requests (a lyrics line clicked).
 * @author DoodzProg
 * @version 0.4.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useApp } from '../context/AppContext.tsx';
import { fr } from '../i18n/fr.ts';
import { formatTime } from '../lib/format.ts';
import { usePlayer } from '../player/PlayerContext.tsx';
import { onSeekRequest, publishPosition } from '../player/position.ts';
import { colors } from '../theme/tokens.ts';
import { Cover } from './Cover.tsx';
import { VolumeIcon } from './Icons.tsx';
import { AlertIcon } from './icons/AlertIcon.tsx';
import { NextIcon } from './icons/NextIcon.tsx';
import { PauseIcon } from './icons/PauseIcon.tsx';
import { PlayIcon } from './icons/PlayIcon.tsx';
import { PrevIcon } from './icons/PrevIcon.tsx';
import { LyricsIcon } from './icons/LyricsIcon.tsx';
import { QueueIcon } from './icons/QueueIcon.tsx';
import { RepeatIcon } from './icons/RepeatIcon.tsx';
import { ShuffleIcon } from './icons/ShuffleIcon.tsx';

const t = fr.player;
const VOLUME_KEY = 'musonic.volume';

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

/** Thin bar with a fill, a knob (hover / drag) and an invisible range input on top. */
function Slider({ value, max, step, label, valueText, disabled, onChange, className }: {
  value: number;
  max: number;
  step: number;
  label: string;
  valueText?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={'track' + (className ? ` ${className}` : '') + (disabled ? ' is-disabled' : '')}>
      <div className="track-bg"><div className="track-fill" style={{ width: `${pct}%` }} /></div>
      <span className="track-knob" style={{ left: `${pct}%` }} aria-hidden="true" />
      <input
        type="range"
        min={0}
        max={max || 0}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        aria-valuetext={valueText}
        disabled={disabled}
      />
    </div>
  );
}

export function PlayerBar() {
  const { client } = useApp();
  const player = usePlayer();
  const { current: song, hasNext, playing, setPlaying, modes, panel } = player;
  const audioRef = useRef<HTMLAudioElement>(null);
  const [position, setPosition] = useState(0);
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
    setPosition(0);
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

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio || !song) return;
    if (audio.paused) audio.play().catch(() => setPlaying(false));
    else audio.pause();
  }

  function previous() {
    const audio = audioRef.current;
    if (!audio) return;
    if (player.previous(audio.currentTime)) restart();
  }

  function seek(value: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setPosition(value);
    publishPosition(value);
  }

  useEffect(() => onSeekRequest(seek));

  // Space toggles playback, Ctrl+Arrows skip, unless the user is typing.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isTyping(event.target)) return;
      if (event.code === 'Space') {
        event.preventDefault();
        togglePlay();
      } else if (event.ctrlKey && event.key === 'ArrowRight') {
        if (hasNext) player.next();
      } else if (event.ctrlKey && event.key === 'ArrowLeft') {
        previous();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const shuffleLabel = t.shuffle[modes.shuffle];
  const repeatLabel = t.repeat[modes.repeat];
  const shownVolume = muted ? 0 : volume;

  return (
    <footer className="player-bar">
      <audio
        ref={audioRef}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          setPosition(e.currentTarget.currentTime);
          publishPosition(e.currentTarget.currentTime);
        }}
        onDurationChange={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
        onEnded={() => {
          if (player.trackEnded()) restart();
        }}
        onError={() => song && setFailed(true)}
      />
      <div className="player-inner">
        <div className="player-track">
          <Cover coverArt={song?.coverArt} size={56} className="cover-60" eager />
          <span className="item-text">
            {song?.albumId ? (
              <Link to={`/album/${song.albumId}`} className="item-title link">{song.title}</Link>
            ) : (
              <span className="item-title">{song ? song.title : t.idle}</span>
            )}
            {song &&
              (song.artistId ? (
                <Link to={`/artist/${song.artistId}`} className="item-sub link">{song.artist}</Link>
              ) : (
                <span className="item-sub">{song.artist}</span>
              ))}
            {failed && (
              <span className="player-error" role="alert"><AlertIcon size={13} triangle /> {t.error}</span>
            )}
          </span>
        </div>

        <div className="player-center">
          <div className="player-controls">
            <button type="button" className="ctrl ctrl-mode" onClick={player.cycleShuffle} aria-label={shuffleLabel} title={shuffleLabel}>
              <ShuffleIcon mode={modes.shuffle} size={20} />
            </button>
            <button type="button" className="ctrl" onClick={previous} disabled={!song} aria-label={t.previous} title={`${t.previous} (Ctrl ←)`}>
              <PrevIcon size={24} />
            </button>
            <button type="button" className="ctrl ctrl-main" onClick={togglePlay} disabled={!song} aria-label={playing ? t.pause : t.play} title={`${playing ? t.pause : t.play} (Espace)`}>
              {playing ? <PauseIcon size={20} color="currentColor" /> : <PlayIcon size={20} color="currentColor" />}
            </button>
            <button type="button" className="ctrl" onClick={player.next} disabled={!hasNext} aria-label={t.next} title={`${t.next} (Ctrl →)`}>
              <NextIcon size={24} />
            </button>
            <button type="button" className="ctrl ctrl-mode" onClick={player.cycleRepeat} aria-label={repeatLabel} title={repeatLabel}>
              <RepeatIcon mode={modes.repeat} size={20} />
            </button>
          </div>
          <div className="progress">
            <span className="time time-left">{formatTime(position)}</span>
            <Slider
              value={position}
              max={duration}
              step={0.1}
              label={t.position}
              valueText={`${formatTime(position)} / ${formatTime(duration)}`}
              disabled={!song}
              onChange={seek}
            />
            <span className="time">{formatTime(duration)}</span>
          </div>
        </div>

        <div className="player-side">
          <button
            type="button"
            className={'icon-btn icon-mode' + (panel === 'lyrics' ? ' is-on' : '')}
            onClick={() => player.togglePanel('lyrics')}
            aria-label={t.lyrics}
            aria-pressed={panel === 'lyrics'}
            title={t.lyrics}>
            <LyricsIcon size={20} color={panel === 'lyrics' ? colors.accent : 'currentColor'} />
            {panel === 'lyrics' && <span className="icon-dot" />}
          </button>
          <button
            type="button"
            className={'icon-btn icon-mode' + (panel === 'queue' ? ' is-on' : '')}
            onClick={() => player.togglePanel('queue')}
            aria-label={t.queue}
            aria-pressed={panel === 'queue'}
            title={t.queue}>
            <QueueIcon size={20} color={panel === 'queue' ? colors.accent : 'currentColor'} />
            {panel === 'queue' && <span className="icon-dot" />}
          </button>
          <button type="button" className="icon-btn" onClick={() => setMuted(!muted)} aria-label={muted ? t.unmute : t.mute}>
            <VolumeIcon muted={muted || volume === 0} />
          </button>
          <Slider
            className="track-volume"
            value={shownVolume}
            max={1}
            step={0.01}
            label={t.volume}
            valueText={`${Math.round(shownVolume * 100)} %`}
            onChange={(v) => {
              setVolume(v);
              setMuted(false);
            }}
          />
          <span className="volume-pct" aria-hidden="true">{Math.round(shownVolume * 100)} %</span>
        </div>
      </div>
    </footer>
  );
}
