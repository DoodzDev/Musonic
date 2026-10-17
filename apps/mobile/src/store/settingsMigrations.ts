/**
 * @file settingsMigrations.ts
 * @description Migrations of the persisted settings shape. Kept apart from
 *   settingsStore.ts so they can be unit-tested without native storage.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */

export const SETTINGS_VERSION = 3;

/**
 * Brings settings saved by an older version up to `SETTINGS_VERSION`.
 * - v0 (unversioned) -> v1: same shape, versioning only.
 * - v1 -> v2: drops the never-used `colorScheme` and `accentColor` fields.
 * - v2 -> v3: adds `musonicApiUrl` / `musonicApiKey`; their defaults (empty)
 *   come from the store, nothing to change in the saved data.
 */
export function migrateSettings(
  persistedState: unknown,
  version: number,
): Record<string, unknown> {
  const state = {...(persistedState as Record<string, unknown>)};
  if (version < 2) {
    delete state.colorScheme;
    delete state.accentColor;
  }
  return state;
}
