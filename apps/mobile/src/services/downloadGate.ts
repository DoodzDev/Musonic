/**
 * @file downloadGate.ts
 * @description "Download on Wi-Fi only" (ADR-010 H7): on mobile data, a
 *   download the user asked for waits for their OK (this one only); automatic
 *   downloads are simply skipped. Storage limit (Advanced setting): once the
 *   downloads use the space allowed, new ones are refused with a message.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import {Alert} from 'react-native';
import {useSettingsStore} from '../store/settingsStore';
import {getT} from '../i18n';
import {isOnMobileData} from './network';
import {toast} from '../components/ui/Toast';

function blocked(): boolean {
  return useSettingsStore.getState().downloadWifiOnly && isOnMobileData();
}

/** Resolves true when `count` tracks may be downloaded now, asking on mobile data. */
export function confirmDownload(count: number): Promise<boolean> {
  if (!blocked()) return Promise.resolve(true);
  const t = getT().downloads;
  return new Promise(resolve => {
    Alert.alert(
      t.mobileDataTitle,
      t.mobileDataMessage(count),
      [
        {text: t.cancelButton, style: 'cancel', onPress: () => resolve(false)},
        {text: t.mobileDataConfirm, onPress: () => resolve(true)},
      ],
      {cancelable: true, onDismiss: () => resolve(false)},
    );
  });
}

/** Automatic downloads (while listening) never ask: they wait for Wi-Fi. */
export function canDownloadAutomatically(): boolean {
  return !blocked();
}

/** True once downloads use all the space allowed (no limit: never). */
export function isStorageFull(usedBytes: number): boolean {
  const limitMB = useSettingsStore.getState().storageLimitMB;
  return limitMB > 0 && usedBytes >= limitMB * 1024 * 1024;
}

let lastFullNotice = 0;

/** Says the limit is reached, once for a burst of refused tracks (a whole album). */
export function notifyStorageFull(): void {
  const now = Date.now();
  if (now - lastFullNotice < 5000) return;
  lastFullNotice = now;
  toast.error(getT().downloads.storageFull);
}
