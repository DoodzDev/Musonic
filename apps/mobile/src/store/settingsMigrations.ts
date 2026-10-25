/**
 * @file settingsMigrations.ts
 * @description Migrations of the persisted settings shape. Kept apart from
 *   settingsStore.ts so they can be unit-tested without native storage.
 * @author DoodzProg
 * @version 1.3.0
 * @license CC-BY-NC-4.0
 */

export const SETTINGS_VERSION = 5;

/**
 * Brings settings saved by an older version up to `SETTINGS_VERSION`.
 * - v0 (unversioned) -> v1: same shape, versioning only.
 * - v1 -> v2: drops the never-used `colorScheme` and `accentColor` fields.
 * - v2 -> v3: adds `musonicApiUrl` / `musonicApiKey`; their defaults (empty)
 *   come from the store, nothing to change in the saved data.
 * - v3 -> v4: accounts may hold `apiKey` / `apiKeyId` or `token` / `salt`
 *   instead of the password, plus `authProblem`; all optional, nothing to
 *   change (passwords are traded at launch by `upgradeSavedAccounts`).
 * - v4 -> v5: drops `musonicApiUrl` / `musonicApiKey` (the Musonic API of
 *   ADR-016 was replaced by Musonic Server).
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
  if (version < 5) {
    delete state.musonicApiUrl;
    delete state.musonicApiKey;
  }
  return state;
}
