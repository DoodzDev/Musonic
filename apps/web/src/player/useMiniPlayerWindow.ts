/**
 * @file useMiniPlayerWindow.ts
 * @description Opens the floating mini player: a Document Picture-in-Picture
 *   window (Chromium browsers: Brave, Chrome, Edge) that stays on top of every
 *   window, even when the tab is hidden or the browser minimized, and can be
 *   moved and resized. The page's styles are copied into it; React renders
 *   into it through a portal, so it shares the player state.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useCallback, useEffect, useState } from 'react';

// Not in TypeScript's DOM types yet.
interface DocumentPictureInPicture {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
  window: Window | null;
}
declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture;
  }
}

const SIZE_KEY = 'musonic.miniPlayerSize';

function readSize(): { width: number; height: number } {
  try {
    const s = JSON.parse(localStorage.getItem(SIZE_KEY) ?? 'null') as { width?: number; height?: number } | null;
    if (s && Number(s.width) >= 200 && Number(s.height) >= 80) return { width: Number(s.width), height: Number(s.height) };
  } catch {
    // Default size below.
  }
  return { width: 380, height: 132 };
}

function copyStyles(target: Document): void {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = target.createElement('style');
      style.textContent = Array.from(sheet.cssRules, (rule) => rule.cssText).join('\n');
      target.head.appendChild(style);
    } catch {
      // Cross-origin sheet: link it instead of reading its rules.
      if (sheet.href) {
        const link = target.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        target.head.appendChild(link);
      }
    }
  }
}

export function useMiniPlayerWindow() {
  const [win, setWin] = useState<Window | null>(null);
  const supported = typeof window !== 'undefined' && 'documentPictureInPicture' in window;

  const open = useCallback(async () => {
    const api = window.documentPictureInPicture;
    if (!api) return;
    if (api.window) {
      api.window.focus();
      return;
    }
    try {
      const pip = await api.requestWindow(readSize());
      copyStyles(pip.document);
      pip.document.title = 'Musonic';
      pip.document.body.className = 'mini-body';
      pip.addEventListener('pagehide', () => {
        try {
          localStorage.setItem(SIZE_KEY, JSON.stringify({ width: pip.innerWidth, height: pip.innerHeight }));
        } catch {
          // Size is a convenience.
        }
        setWin(null);
      });
      setWin(pip);
    } catch {
      // Refused (no user click, or the browser said no): nothing to do.
    }
  }, []);

  const close = useCallback(() => win?.close(), [win]);

  // The mini player belongs to this page: close it with the app (logout included).
  useEffect(() => () => win?.close(), [win]);

  return { win, supported, open, close };
}
