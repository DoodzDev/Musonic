/**
 * @file networkStore.ts
 * @description Zustand store for network/connectivity state. Updated by
 *   connectivityService; consumed by OfflineBanner and Home auto-recovery.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {create} from 'zustand';

type NetworkState = {
  isOffline: boolean;
  serverReachable: boolean;
  setOffline: (v: boolean) => void;
  setServerReachable: (v: boolean) => void;
};

export const useNetworkStore = create<NetworkState>(set => ({
  isOffline: false,
  serverReachable: true,  // optimistic default — avoids flash on startup
  setOffline: v => set({isOffline: v}),
  setServerReachable: v => set({serverReachable: v}),
}));
