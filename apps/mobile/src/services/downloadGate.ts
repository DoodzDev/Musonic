/**
 * @file downloadGate.ts
 * @description "Download on Wi-Fi only" (ADR-010 H7): on mobile data, a
 *   download the user asked for waits for their OK (this one only); automatic
 *   downloads are simply skipped.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {Alert} from 'react-native';
import {useSettingsStore} from '../store/settingsStore';
import {getT} from '../i18n';
import {isOnMobileData} from './network';

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
