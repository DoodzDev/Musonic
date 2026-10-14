/**
 * @file connectivityService.ts
 * @description Background polling service that pings the active Subsonic server
 *   every 15 s and updates networkStore.isOffline. Used by ConnectivityMonitor
 *   and the Home screen auto-recovery logic. `checkNow` runs a check at once
 *   (the playback engine calls it on a stream network error).
 * @author DoodzProg
 * @version 1.3.0
 * @license CC-BY-NC-4.0
 */
import {getActiveServer, pingServer} from '../api/client';
import {useNetworkStore} from '../store/networkStore';
import {useDownloadStore} from '../store/downloadStore';
import {useSettingsStore} from '../store/settingsStore';

// ─── Utils ────────────────────────────────────────────────────────────────────

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('connectivity_timeout')), ms),
    ),
  ]);
}

// ─── Ping loop ────────────────────────────────────────────────────────────────

const INTERVAL_NORMAL_MS = 10_000;
const INTERVAL_DEGRADED_MS = 5_000;
const PING_TIMEOUT_MS = 5_000;
// Consecutive failed pings before switching to offline mode: a single slow
// request must not take the whole app offline (ISS-032).
const FAILURES_BEFORE_OFFLINE = 3;

let timerId: ReturnType<typeof setTimeout> | null = null;
let active = false;
let consecutiveFailures = 0;
/** Result of the previous ping: the first success after a failure (or at start) triggers the cover backfill. */
let lastPingOk = false;

/** One server check; true when the server answered. */
async function tick(): Promise<boolean> {
  if (!active) return false;
  const server = getActiveServer();
  if (!server) {
    schedule(INTERVAL_DEGRADED_MS);
    return false;
  }
  const startedAt = Date.now();
  try {
    await withTimeout(pingServer(server), PING_TIMEOUT_MS);
    if (consecutiveFailures > 0) {
      console.log(`[connectivity] ping ok after ${consecutiveFailures} failure(s), ${Date.now() - startedAt} ms`);
    }
    consecutiveFailures = 0;
    useNetworkStore.getState().setServerReachable(true);
    if (!lastPingOk) {
      lastPingOk = true;
      // Covers of tracks downloaded offline or before ISS-034 (runs in the background).
      useDownloadStore.getState().backfillCovers();
    }
    const s = useSettingsStore.getState();
    if (s.isOfflineMode && s.autoOnlineMode) {
      console.log('[connectivity] back online');
      s.setOfflineMode(false);
    }
    schedule(INTERVAL_NORMAL_MS);
    return true;
  } catch (e) {
    consecutiveFailures++;
    lastPingOk = false;
    // No URL in the log: it carries the account credentials.
    const reason = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.warn(`[connectivity] ping failed #${consecutiveFailures} after ${Date.now() - startedAt} ms (${reason})`);
    useNetworkStore.getState().setServerReachable(false);
    const s = useSettingsStore.getState();
    if (!s.isOfflineMode && consecutiveFailures >= FAILURES_BEFORE_OFFLINE) {
      console.warn('[connectivity] switching to offline mode');
      s.setOfflineMode(true);
    }
    schedule(INTERVAL_DEGRADED_MS);
    return false;
  }
}

function schedule(ms: number) {
  if (timerId) clearTimeout(timerId);
  if (!active) return;
  timerId = setTimeout(tick, ms);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function start(): () => void {
  active = true;
  consecutiveFailures = 0;
  lastPingOk = false;
  tick();
  return stop;
}

/** Checks the server now instead of waiting for the next tick. */
export function checkNow(): Promise<boolean> {
  if (timerId) clearTimeout(timerId);
  return tick();
}

export function stop() {
  active = false;
  if (timerId) {
    clearTimeout(timerId);
    timerId = null;
  }
}
