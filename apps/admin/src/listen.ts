/**
 * @file listen.ts
 * @description The page's player to listen to a library file and check it: which file plays,
 *   play or stop one. Not a music player.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useRef, useState } from 'react';
import { session } from './api.ts';

/** The file's address (an `<audio>` cannot send a header: the session goes in it). */
function fileUrl(fileId: string): string {
  return `/v1/admin/library/files/${encodeURIComponent(fileId)}?token=${encodeURIComponent(session.token ?? '')}`;
}

/** The page's player: which file plays, and a way to play or stop one. */
export function useListen() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  useEffect(() => {
    const a = new Audio();
    a.preload = 'none';
    const stop = () => setPlaying(null);
    a.addEventListener('ended', stop);
    a.addEventListener('error', stop);
    audio.current = a;
    return () => {
      a.pause();
      a.removeAttribute('src');
      a.removeEventListener('ended', stop);
      a.removeEventListener('error', stop);
    };
  }, []);
  const toggle = (fileId: string) => {
    const a = audio.current;
    if (!a) return;
    if (playing === fileId) {
      a.pause();
      setPlaying(null);
      return;
    }
    a.src = fileUrl(fileId);
    void a.play().catch(() => setPlaying(null));
    setPlaying(fileId);
  };
  return { playing, toggle };
}
