/**
 * @file useTrackQuality.ts
 * @description Quality label of a track for the full player (`FLAC`, `MP3 320`).
 *   One `getSong` request per track, remembered for the session; nothing is
 *   asked offline or for tracks outside the library (`ext-`).
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {useEffect, useState} from 'react';
import {getSong} from '../api/endpoints/library';
import {useSettingsStore} from '../store/settingsStore';
import {qualityLabel} from '../utils/quality';

/** `trackId → label` (null: the server gave no format). Errors are not remembered. */
const cache = new Map<string, string | null>();

export function useTrackQuality(trackId: string | undefined): string | null {
  const isOfflineMode = useSettingsStore(s => s.isOfflineMode);
  const [label, setLabel] = useState<string | null>(() => (trackId ? cache.get(trackId) ?? null : null));

  useEffect(() => {
    if (!trackId || trackId.startsWith('ext-')) { setLabel(null); return; }
    if (cache.has(trackId)) { setLabel(cache.get(trackId) ?? null); return; }
    setLabel(null);
    if (isOfflineMode) return;
    let cancelled = false;
    getSong(trackId)
      .then(song => {
        const value = song ? qualityLabel(song) : null;
        cache.set(trackId, value);
        if (!cancelled) setLabel(value);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [trackId, isOfflineMode]);

  return label;
}
