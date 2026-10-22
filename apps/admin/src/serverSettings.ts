/**
 * @file serverSettings.ts
 * @description The server's settings changed from the console (`/v1/admin/settings`): each
 *   page shows the ones it is about. A changed setting is applied at the next restart.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useCallback, useEffect, useState } from 'react';
import type { Settings } from '@musonic/core';
import { api } from './api.ts';

export type SettingKey =
  | 'import'
  | 'import_quality'
  | 'online'
  | 'online_previews'
  | 'scan_interval_minutes'
  | 'backup_days'
  | 'transcode_cache_mb'
  | 'legacy_auth'
  | 'update_check'
  | 'max_bit_rate'
  | 'transcode_format';

export function useServerSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Settings>('/v1/admin/settings')
      .then(setSettings)
      .catch((e: Error) => setError(e.message));
  }, []);
  /** What it will be at the next start. */
  const value = useCallback((key: SettingKey) => settings?.settings.find((s) => s.key === key)?.value, [settings]);
  const set = useCallback((key: SettingKey, value: boolean | number | string) => {
    setError(null);
    api<Settings>('/v1/admin/settings', { method: 'PUT', body: { key, value } })
      .then(setSettings)
      .catch((e: Error) => setError(e.message));
  }, []);
  return { loaded: settings !== null, restartNeeded: settings?.restartNeeded ?? false, value, set, error };
}
