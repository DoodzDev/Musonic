/**
 * @file Toast.tsx
 * @description Host of the short confirmations sent with `toast()` (lib/toast.ts),
 *   shown above the player bar.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useState } from 'react';
import { TOAST_EVENT } from '../lib/toast.ts';

const SHOW_MS = 2400;

export function ToastHost() {
  const [message, setMessage] = useState<{ text: string; id: number } | null>(null);

  useEffect(() => {
    function onToast(event: Event) {
      setMessage({ text: (event as CustomEvent<string>).detail, id: Date.now() });
    }
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), SHOW_MS);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <div className="toast-host" aria-live="polite">
      {message && <div key={message.id} className="toast">{message.text}</div>}
    </div>
  );
}
