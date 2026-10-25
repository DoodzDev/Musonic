/**
 * @file settingsMigrations.test.ts
 * @description Unit tests for the persisted settings migrations.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import {migrateSettings} from '../../src/store/settingsMigrations';

describe('migrateSettings', () => {
  const v1 = {
    servers: [{id: 's1'}],
    activeServerId: 's1',
    colorScheme: 'system',
    accentColor: '#FF6B35',
    locale: 'fr',
  };

  it('drops colorScheme and accentColor from v1 settings', () => {
    expect(migrateSettings(v1, 1)).toEqual({
      servers: [{id: 's1'}],
      activeServerId: 's1',
      locale: 'fr',
    });
  });

  it('migrates unversioned (v0) settings the same way', () => {
    expect(migrateSettings(v1, 0)).not.toHaveProperty('accentColor');
  });

  it('drops the Musonic API settings of v4 and older', () => {
    const v4 = {servers: [], musonicApiUrl: 'https://api.example.com', musonicApiKey: 'k', locale: 'en'};
    expect(migrateSettings(v4, 4)).toEqual({servers: [], locale: 'en'});
  });

  it('does not mutate the stored object', () => {
    migrateSettings(v1, 1);
    expect(v1).toHaveProperty('colorScheme', 'system');
  });
});
