/**
 * @file network.ts
 * @description Kind of network the phone is on (Wi-Fi, mobile data…), kept
 *   up to date by NetInfo once `startNetworkWatch` has run. Read
 *   synchronously by the stream URL builder (quality per network) and the
 *   download gate (Wi-Fi only). Unknown until the first update: treated as
 *   not mobile data, so nothing is blocked at startup.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import NetInfo, {NetInfoStateType, type NetInfoSubscription} from '@react-native-community/netinfo';

let kind: NetInfoStateType = NetInfoStateType.unknown;
let subscription: NetInfoSubscription | null = null;

/** Starts following network changes (idempotent). */
export function startNetworkWatch(): void {
  if (subscription) return;
  subscription = NetInfo.addEventListener(state => {
    kind = state.type;
  });
}

/** True on mobile data (metered), the case where Wi-Fi-only settings apply. */
export function isOnMobileData(): boolean {
  return kind === NetInfoStateType.cellular;
}
