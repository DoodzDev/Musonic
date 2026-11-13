/**
 * @file useIsMusonicServer.ts
 * @description Whether the active account is on Musonic Server: only Musonic Server gives the
 *   app a device key, so it is known at once and stays right offline. Features only Musonic
 *   Server has (podcasts, playlist imports) are hidden elsewhere.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {useSettingsStore} from '../store/settingsStore';

export function useIsMusonicServer(): boolean {
  return useSettingsStore(s => !!s.servers.find(server => server.id === s.activeServerId)?.apiKey);
}
