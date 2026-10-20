/**
 * @file status.tsx
 * @description The server's state (`/v1/admin/status`), read every few seconds and shared by
 *   the event bar and the dashboard.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useState, type ReactNode } from 'react';
import type { AdminStatus } from '@musonic/core';
import { api } from './api.ts';
import { StatusContext } from './useStatus.ts';

const EVERY_MS = 3000;

export function StatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AdminStatus | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const load = () => api<AdminStatus>('/v1/admin/status').then((s) => alive && setStatus(s)).catch(() => alive && setStatus(null));
    load();
    const t = setInterval(() => document.visibilityState === 'visible' && load(), EVERY_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return <StatusContext.Provider value={status}>{children}</StatusContext.Provider>;
}
