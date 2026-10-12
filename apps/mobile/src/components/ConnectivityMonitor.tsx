/**
 * @file ConnectivityMonitor.tsx
 * @description Null-render component that starts the connectivity polling service
 *   when mounted. Lives in App.tsx so network status is always tracked.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {useEffect} from 'react';
import {start} from '../services/connectivityService';

export default function ConnectivityMonitor() {
  useEffect(() => {
    const stop = start();
    return stop;
  }, []);
  return null;
}
