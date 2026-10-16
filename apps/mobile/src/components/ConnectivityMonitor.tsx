/**
 * @file ConnectivityMonitor.tsx
 * @description Null-render component that starts the connectivity polling service
 *   when mounted, and the Wi-Fi / mobile data watch. Lives in App.tsx so
 *   network status is always tracked.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import {useEffect} from 'react';
import {startNetworkWatch} from '../services/network';
import {start} from '../services/connectivityService';

export default function ConnectivityMonitor() {
  // Wi-Fi or mobile data, for the streaming quality and Wi-Fi-only downloads.
  useEffect(startNetworkWatch, []);
  useEffect(() => {
    const stop = start();
    return stop;
  }, []);
  return null;
}
