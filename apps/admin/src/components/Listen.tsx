/**
 * @file Listen.tsx
 * @description Listening to a library file: the Library's player (provider), the button of
 *   each file, and the bar at the bottom (picture, title, play / pause, position). It lives
 *   in the Library only (song list and song pages): leaving it stops the music.
 * @author DoodzProg
 * @version 0.2.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Outlet } from 'react-router';
import { Icon } from '@musonic/icons';
import { coverUrl, fileUrl, ListenContext, useListen, type Listen, type ListenItem } from '../listen.ts';
import { t } from '../i18n/index.ts';

export function ListenProvider({ children }: { children: ReactNode }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [item, setItem] = useState<ListenItem | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const a = new Audio();
    a.preload = 'metadata';
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => setTime(a.currentTime);
    const onMeta = () => setDuration(Number.isFinite(a.duration) ? a.duration : 0);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onPause);
    a.addEventListener('error', onPause);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('durationchange', onMeta);
    audio.current = a;
    return () => {
      a.pause();
      a.removeAttribute('src');
    };
  }, []);

  const value = useMemo<Listen>(() => {
    const a = () => audio.current;
    return {
      item,
      playing,
      time,
      duration,
      toggle: (next) => {
        const el = a();
        if (!el) return;
        if (item?.fileId === next.fileId) {
          if (el.paused) void el.play().catch(() => {});
          else el.pause();
          return;
        }
        el.src = fileUrl(next.fileId);
        setItem(next);
        setTime(0);
        setDuration(0);
        void el.play().catch(() => setPlaying(false));
      },
      playPause: () => {
        const el = a();
        if (!el || !item) return;
        if (el.paused) void el.play().catch(() => {});
        else el.pause();
      },
      seek: (seconds) => {
        const el = a();
        if (el) el.currentTime = seconds;
      },
      close: () => {
        const el = a();
        el?.pause();
        el?.removeAttribute('src');
        setItem(null);
      },
    };
  }, [item, playing, time, duration]);

  return <ListenContext.Provider value={value}>{children}</ListenContext.Provider>;
}

/** The Library's pages, with their player kept from one to the other. */
export function LibraryShell() {
  return (
    <ListenProvider>
      <Outlet />
      <MiniPlayer />
    </ListenProvider>
  );
}

export function ListenButton({ item, label = t.library.listen, primary = false }: { item: ListenItem; label?: string; primary?: boolean }) {
  const listen = useListen();
  const on = listen.item?.fileId === item.fileId && listen.playing;
  return (
    <button
      type="button"
      className={'btn sm' + (primary ? ' primary' : '')}
      onClick={(e) => {
        e.stopPropagation();
        listen.toggle(item);
      }}
    >
      <Icon name={on ? 'pause' : 'play'} size={14} /> {on ? t.library.pause : label}
    </button>
  );
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The bar at the bottom of the console while a file is loaded. */
export function MiniPlayer() {
  const { item, playing, time, duration, playPause, seek, close } = useListen();
  if (!item) return null;
  return (
    <div className="miniplayer" role="region" aria-label={t.library.player}>
      <img className="cover" src={coverUrl(item.trackId, 80)} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
      <div className="miniplayer__text">
        <b>{item.title}</b>
        <span className="muted small">{item.artist}</span>
      </div>
      <button type="button" className="miniplayer__play" onClick={playPause} aria-label={playing ? t.library.pause : t.library.listen}>
        <Icon name={playing ? 'pause' : 'play'} size={18} />
      </button>
      <span className="miniplayer__time">{clock(time)}</span>
      <input
        type="range"
        className="miniplayer__seek"
        min={0}
        max={duration || 0}
        step={1}
        value={Math.min(time, duration || 0)}
        disabled={!duration}
        onChange={(e) => seek(Number(e.target.value))}
        aria-label={t.library.position}
        style={{ ['--p' as string]: duration ? `${(time / duration) * 100}%` : '0%' }}
      />
      <span className="miniplayer__time">{clock(duration)}</span>
      <button type="button" className="btn ghost sm" onClick={close} aria-label={t.common.close} title={t.common.close}>
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
