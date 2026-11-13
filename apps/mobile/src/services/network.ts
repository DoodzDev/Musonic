/**
 * @file network.ts
 * @description Kind of network the phone is on (Wi-Fi, mobile data…), kept
 *   up to date by NetInfo once `startNetworkWatch` has run. Read
 *   synchronously by the stream URL builder (quality per network) and the
 *   download gate (Wi-Fi only). Unknown until the first update: treated as
 *   not mobile data, so nothing is blocked at startup. Also whether the phone has a
 *   network at all, to tell « no internet » from « server unreachable ».
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import NetInfo, {NetInfoStateType, type NetInfoSubscription} from '@react-native-community/netinfo';

let kind: NetInfoStateType = NetInfoStateType.unknown;
/** Null until NetInfo answers. */
let connected: boolean | null = null;
let subscription: NetInfoSubscription | null = null;

/** Starts following network changes (idempotent). */
export function startNetworkWatch(): void {
  if (subscription) return;
  subscription = NetInfo.addEventListener(state => {
    kind = state.type;
    connected = state.isConnected;
  });
}

/** False only when the phone itself has no network (unknown counts as having one). */
export function phoneHasNetwork(): boolean {
  return connected !== false && kind !== NetInfoStateType.none;
}

/** True on mobile data (metered), the case where Wi-Fi-only settings apply. */
export function isOnMobileData(): boolean {
  return kind === NetInfoStateType.cellular;
}
